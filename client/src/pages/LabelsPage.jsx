import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSellableVariants } from '../db/catalogRepo'
import { chooseSymbology } from '../labels/ean'
import { checkHelper, sendToHelper } from '../labels/helperClient'
import { LABEL_PRESETS, buildLabel, validateLabelSize } from '../labels/labelModel'
import { buildLabelPrintJob, buildTestPrintJob } from '../labels/printJob'
import { loadPrinterSettings, savePrinterSettings, tsplOptions } from '../labels/printerSettings'
import LabelPreview from '../components/LabelPreview'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { clearLabelPreset, readLabelPreset } from '../lib/labelPreset'

const MAX_LABELS = 200

const stockText = (variant) =>
    variant.unit === 'meter' ? `${(variant.currentStock / 100).toFixed(2)} m` : String(variant.currentStock)

// When printing through the browser, the page is exactly one label big and every label is
// its own page.
const printCss = (widthMm, heightMm) => `
@media print {
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  #label-sheet { display: block !important; gap: 0 !important; }
  #label-sheet > * { break-after: page; page-break-after: always; margin: 0 !important; }
  #label-sheet > *:last-child { break-after: auto; page-break-after: auto; }
}
`

export default function LabelsPage() {
    const items = useLiveQuery(() => listSellableVariants(), [])
    // Coming from "Add stock", the new entries already have their copies filled in.
    const [copies, setCopies] = useState(() => readLabelPreset())
    const [presetId, setPresetId] = useState(LABEL_PRESETS[0].id)
    const [customWidth, setCustomWidth] = useState('50')
    const [customHeight, setCustomHeight] = useState('25')
    const [priceMode, setPriceMode] = useState('mrp')
    const [search, setSearch] = useState('')
    const [printer, setPrinter] = useState(() => loadPrinterSettings())
    const [status, setStatus] = useState(null) // { type: 'ok' | 'error', text }
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        clearLabelPreset()
    }, [])

    const preset = LABEL_PRESETS.find((p) => p.id === presetId)
    const widthMm = preset ? preset.widthMm : Number(customWidth)
    const heightMm = preset ? preset.heightMm : Number(customHeight)
    const sizeError = validateLabelSize(widthMm, heightMm)

    const query = search.trim().toLowerCase()
    const shown = (items ?? []).filter(
        ({ variant, product }) =>
            !query ||
            product.name.toLowerCase().includes(query) ||
            variant.barcode.toLowerCase().includes(query),
    )

    const labels = useMemo(
        () =>
            (items ?? []).flatMap(({ variant, product }) => {
                const count = copies[variant.id] ?? 0
                if (!count) return []
                const label = buildLabel(variant, product, { priceMode })
                return Array.from({ length: count }, (_, i) => ({ key: `${variant.id}-${i}`, label }))
            }),
        [items, copies, priceMode],
    )
    const visible = labels.slice(0, MAX_LABELS)

    function setCopiesFor(variantId, text) {
        const count = Math.max(0, Math.min(99, Math.floor(Number(text)) || 0))
        setCopies((c) => ({ ...c, [variantId]: count }))
    }

    function oneOfEachShown() {
        setCopies((c) => {
            const next = { ...c }
            for (const { variant } of shown) next[variant.id] = 1
            return next
        })
    }

    // One label for each piece in stock (at most 99 for one entry; fabric by the meter gets 1).
    function copiesFromStock() {
        setCopies((c) => {
            const next = { ...c }
            for (const { variant } of shown) {
                next[variant.id] =
                    variant.unit === 'meter' ? 1 : Math.max(0, Math.min(99, variant.currentStock))
            }
            return next
        })
    }

    function changePrinter(patch) {
        setPrinter((current) => {
            const next = { ...current, ...patch }
            savePrinterSettings(next)
            return next
        })
    }
    const numberField = (key) => (e) =>
        changePrinter({ [key]: e.target.value === '' ? 0 : Number(e.target.value) })

    // Direct printing: the label goes to the printer as a picture, with no print window.
    async function sendDirect(makeJob, doneText) {
        setBusy(true)
        setStatus(null)
        try {
            const bytes = await makeJob()
            await sendToHelper(printer.helperUrl, bytes, { printerName: printer.printerName })
            setStatus({ type: 'ok', text: doneText })
        } catch (err) {
            setStatus({ type: 'error', text: err?.message || 'Could not print the labels' })
        } finally {
            setBusy(false)
        }
    }

    function handlePrint() {
        if (!printer.direct) {
            window.print()
            return undefined
        }
        const entries = (items ?? []).flatMap(({ variant, product }) => {
            const count = copies[variant.id] ?? 0
            return count ? [{ label: buildLabel(variant, product, { priceMode }), copies: count }] : []
        })
        const total = entries.reduce((n, entry) => n + entry.copies, 0)
        return sendDirect(
            () => buildLabelPrintJob({ entries, widthMm, heightMm, options: tsplOptions(printer) }),
            `Sent ${total} ${total === 1 ? 'label' : 'labels'} to the printer`,
        )
    }

    function handleTestPrint() {
        return sendDirect(
            () => buildTestPrintJob({ widthMm, heightMm, options: tsplOptions(printer) }),
            'Test label sent to the printer',
        )
    }

    async function handleCheck() {
        setBusy(true)
        setStatus(null)
        try {
            const info = await checkHelper(printer.helperUrl)
            setStatus({
                type: 'ok',
                text: `Connected to the label helper. Printer: ${info?.printer ?? 'unknown'}`,
            })
        } catch (err) {
            setStatus({ type: 'error', text: err?.message || 'Could not reach the label helper' })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="space-y-4 print:hidden">
                <h2 className="text-xl font-bold">Barcode labels</h2>

                <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                    <FormField
                        label="Label size"
                        htmlFor="label-size"
                        hint="Choose the size of the sticker on your roll."
                    >
                        <select
                            id="label-size"
                            className={inputClass}
                            value={presetId}
                            onChange={(e) => setPresetId(e.target.value)}
                        >
                            {LABEL_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label}
                                </option>
                            ))}
                            <option value="custom">Custom size</option>
                        </select>
                    </FormField>

                    {!preset && (
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Width (mm)" htmlFor="label-width">
                                <input
                                    id="label-width"
                                    inputMode="decimal"
                                    className={inputClass}
                                    value={customWidth}
                                    onChange={(e) => setCustomWidth(e.target.value)}
                                />
                            </FormField>
                            <FormField label="Height (mm)" htmlFor="label-height">
                                <input
                                    id="label-height"
                                    inputMode="decimal"
                                    className={inputClass}
                                    value={customHeight}
                                    onChange={(e) => setCustomHeight(e.target.value)}
                                />
                            </FormField>
                        </div>
                    )}
                    {sizeError && <p className="text-sm text-red-600">{sizeError}</p>}

                    <FormField label="Price on label" htmlFor="label-price-mode">
                        <select
                            id="label-price-mode"
                            className={inputClass}
                            value={priceMode}
                            onChange={(e) => setPriceMode(e.target.value)}
                        >
                            <option value="mrp">MRP</option>
                            <option value="selling">Selling price</option>
                            <option value="none">No price</option>
                        </select>
                    </FormField>
                </div>

                <details className="rounded-xl bg-white p-4 shadow-sm">
                    <summary className="cursor-pointer font-semibold">
                        Direct printing to the label printer {printer.direct ? '(on)' : '(off)'}
                    </summary>
                    <div className="mt-3 space-y-3">
                        <p className="text-sm text-slate-600">
                            Sends each label straight to the printer, with no print window and no paper size or
                            orientation to choose. It needs the small label helper running on this computer.
                        </p>
                        <label className="flex items-center gap-2 text-sm font-medium">
                            <input
                                type="checkbox"
                                checked={printer.direct}
                                onChange={(e) => changePrinter({ direct: e.target.checked })}
                            />
                            Print directly to the label printer (no print window)
                        </label>
                        <FormField label="Label helper address" htmlFor="helper-url">
                            <input
                                id="helper-url"
                                className={inputClass}
                                value={printer.helperUrl}
                                onChange={(e) => changePrinter({ helperUrl: e.target.value })}
                            />
                        </FormField>
                        <FormField
                            label="Printer name (optional)"
                            htmlFor="helper-printer"
                            hint="Leave empty to use the printer the helper was started with."
                        >
                            <input
                                id="helper-printer"
                                className={inputClass}
                                value={printer.printerName}
                                onChange={(e) => changePrinter({ printerName: e.target.value })}
                                placeholder="TSC TTP-244 Pro"
                            />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Gap between labels (mm)" htmlFor="helper-gap">
                                <input
                                    id="helper-gap"
                                    type="number"
                                    min="0"
                                    max="20"
                                    step="0.5"
                                    className={inputClass}
                                    value={printer.gapMm}
                                    onChange={numberField('gapMm')}
                                />
                            </FormField>
                            <FormField label="Darkness (0-15)" htmlFor="helper-density">
                                <input
                                    id="helper-density"
                                    type="number"
                                    min="0"
                                    max="15"
                                    className={inputClass}
                                    value={printer.density}
                                    onChange={numberField('density')}
                                />
                            </FormField>
                            <FormField label="Move print right (mm)" htmlFor="helper-x">
                                <input
                                    id="helper-x"
                                    type="number"
                                    min="0"
                                    max="20"
                                    step="0.5"
                                    className={inputClass}
                                    value={printer.offsetXmm}
                                    onChange={numberField('offsetXmm')}
                                />
                            </FormField>
                            <FormField label="Move print down (mm)" htmlFor="helper-y">
                                <input
                                    id="helper-y"
                                    type="number"
                                    min="0"
                                    max="20"
                                    step="0.5"
                                    className={inputClass}
                                    value={printer.offsetYmm}
                                    onChange={numberField('offsetYmm')}
                                />
                            </FormField>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={printer.upsideDown}
                                onChange={(e) => changePrinter({ upsideDown: e.target.checked })}
                            />
                            Turn the label upside-down (if the test label shows TOP at the bottom)
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={secondaryButton} disabled={busy} onClick={handleCheck}>
                                Test connection
                            </button>
                            <button
                                type="button"
                                className={secondaryButton}
                                disabled={busy || Boolean(sizeError)}
                                onClick={handleTestPrint}
                            >
                                Print test label
                            </button>
                        </div>
                    </div>
                </details>

                <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                    <FormField label="Search items" htmlFor="label-search">
                        <input
                            id="label-search"
                            className={inputClass}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Name or barcode"
                        />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={secondaryButton}
                            disabled={!shown.length}
                            onClick={oneOfEachShown}
                        >
                            Set 1 copy of each shown
                        </button>
                        <button
                            type="button"
                            className={secondaryButton}
                            disabled={!shown.length}
                            onClick={copiesFromStock}
                        >
                            Copies = stock for items shown
                        </button>
                        <button type="button" className={secondaryButton} onClick={() => setCopies({})}>
                            Clear all copies
                        </button>
                    </div>

                    {items && items.length === 0 && (
                        <p className="text-sm text-slate-500">No products yet. Add stock first.</p>
                    )}

                    <ul className="space-y-2">
                        {shown.map(({ variant, product }) => {
                            const { warning } = chooseSymbology(variant.barcode)
                            return (
                                <li
                                    key={variant.id}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {product.name}
                                            {variant.size ? ` · Size ${variant.size}` : ''}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {variant.barcode} · Stock {stockText(variant)}
                                        </p>
                                        {warning && <p className="text-xs text-amber-700">{warning}</p>}
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        max="99"
                                        aria-label={`Copies of ${product.name} size ${variant.size}`}
                                        className="w-20 rounded-lg border border-slate-300 px-2 py-2"
                                        value={copies[variant.id] ?? 0}
                                        onChange={(e) => setCopiesFor(variant.id, e.target.value)}
                                    />
                                </li>
                            )
                        })}
                    </ul>
                </div>

                {status && (
                    <p
                        role={status.type === 'error' ? 'alert' : 'status'}
                        className={`rounded-lg p-3 text-sm ${status.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}
                    >
                        {status.text}
                    </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        className={primaryButton}
                        disabled={!visible.length || Boolean(sizeError) || busy}
                        onClick={handlePrint}
                    >
                        Print labels
                    </button>
                    {printer.direct && status?.type === 'error' && (
                        <button type="button" className={secondaryButton} onClick={() => window.print()}>
                            Print with the browser instead
                        </button>
                    )}
                    <p className="text-sm text-slate-600">
                        {labels.length} labels
                        {labels.length > MAX_LABELS && ` (showing the first ${MAX_LABELS})`}
                    </p>
                </div>
                {!printer.direct && (
                    <p className="text-xs text-slate-500">
                        Printing through the browser: each label prints on its own page of the label size. In the
                        print window choose your label printer, the same paper size, margins &ldquo;None&rdquo; and
                        scale 100%. Turn on direct printing above to skip all of that.
                    </p>
                )}
            </div>

            {!sizeError && (
                <>
                    <style>{printCss(widthMm, heightMm)}</style>
                    <div id="label-sheet" className="flex flex-wrap gap-2 print:gap-1">
                        {visible.map(({ key, label }) => (
                            <LabelPreview key={key} label={label} widthMm={widthMm} heightMm={heightMm} />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}