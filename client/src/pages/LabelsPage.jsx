import { formatINR } from '../lib/money'
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSellableVariants } from '../db/catalogRepo'
import { db } from '../db/db'
import { chooseSymbology } from '../labels/ean'
import { sendToHelper } from '../labels/helperClient'
import { LABEL_PRESETS, buildLabel, validateLabelSize } from '../labels/labelModel'
import { loadLabelPrefs } from '../labels/labelPrefs'
import { buildLabelPrintJob } from '../labels/printJob'
import { loadPrinterSettings, tsplOptions } from '../labels/printerSettings'
import LabelPreview from '../components/LabelPreview'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { formatDateTime } from '../lib/format'
import { clearLabelPreset, readLabelPreset } from '../lib/labelPreset'

const MAX_LABELS = 200
const HEADER_KEY = 'labelHeader'

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
    // When stock was last added for each item (opening stock or a purchase).
    const addedAt = useLiveQuery(async () => {
        const moves = await db.stockMovements.toArray()
        const latest = new Map()
        for (const m of moves) {
            if (m.type !== 'opening' && m.type !== 'purchase') continue
            if (!latest.has(m.variantId) || m.createdAt > latest.get(m.variantId)) {
                latest.set(m.variantId, m.createdAt)
            }
        }
        return latest
    }, [])
    const addedOn = (variant) => addedAt?.get(variant.id) ?? variant.createdAt

    // Label size, price and printer are set once in Settings.
    const [prefs] = useState(() => loadLabelPrefs())
    const [printer] = useState(() => loadPrinterSettings())
    const headerRow = useLiveQuery(() => db.settings.get(HEADER_KEY), [])
    const header = typeof headerRow?.value === 'string' ? headerRow.value : ''
    const priceMode = prefs.priceMode

    // Coming from "Add stock", the new entries already have their copies filled in.
    const [copies, setCopies] = useState(() => readLabelPreset())
    const [search, setSearch] = useState('')
    const [addedFilter, setAddedFilter] = useState('all') // all | today | week
    const [visibleCount, setVisibleCount] = useState(20)
    const [status, setStatus] = useState(null) // { type: 'ok' | 'error', text }
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        clearLabelPreset()
    }, [])

    const preset = LABEL_PRESETS.find((p) => p.id === (prefs.presetId || LABEL_PRESETS[0].id))
    const widthMm = preset ? preset.widthMm : Number(prefs.customWidth)
    const heightMm = preset ? preset.heightMm : Number(prefs.customHeight)
    const sizeError = validateLabelSize(widthMm, heightMm)

    const query = search.trim().toLowerCase()
    // A typed number such as 299 or 299.50 is also looked up as a price (MRP or selling price).
    const typedPaise = (() => {
        const text = query.replace(/[₹,\s]/g, '')
        if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
        return Math.round(Number(text) * 100)
    })()
    const shown = (items ?? [])
        .filter(({ variant }) => {
            if (addedFilter === 'all') return true
            const days = addedFilter === 'today' ? 1 : 7
            const from = new Date()
            from.setHours(0, 0, 0, 0)
            from.setDate(from.getDate() - (days - 1))
            return new Date(addedOn(variant)) >= from
        })
        .filter(
            ({ variant, product }) =>
                !query ||
                product.name.toLowerCase().includes(query) ||
                // short numbers are prices, so only long numbers are looked up inside the barcode
                (query.length >= 6 && variant.barcode.toLowerCase().includes(query)) ||
                (typedPaise !== null &&
                    (variant.mrpPaise === typedPaise || variant.sellingPricePaise === typedPaise)),
        )
        .sort((a, b) => String(addedOn(b.variant)).localeCompare(String(addedOn(a.variant))))

    const labels = useMemo(
        () =>
            (items ?? []).flatMap(({ variant, product }) => {
                const count = copies[variant.id] ?? 0
                if (!count) return []
                const label = buildLabel(variant, product, { priceMode, header })
                return Array.from({ length: count }, (_, i) => ({ key: `${variant.id}-${i}`, label }))
            }),
        [items, copies, priceMode, header],
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
            return count
                ? [{ label: buildLabel(variant, product, { priceMode, header }), copies: count }]
                : []
        })
        const total = entries.reduce((n, entry) => n + entry.copies, 0)
        return sendDirect(
            () => buildLabelPrintJob({ entries, widthMm, heightMm, options: tsplOptions(printer) }),
            `Sent ${total} ${total === 1 ? 'label' : 'labels'} to the printer`,
        )
    }


    return (
        <div className="space-y-4">
            <div className="space-y-4 print:hidden">
                <h2 className="text-xl font-bold">Barcode labels</h2>

                
                {sizeError && <p className="text-sm text-red-600">{sizeError}</p>}

                <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="Search items" htmlFor="label-search">
                            <input
                                id="label-search"
                                className={inputClass}
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value)
                                    setVisibleCount(20)
                                }}
                                placeholder="Name, barcode or price (e.g. 299)"
                            />
                        </FormField>
                        <FormField label="Show items added" htmlFor="label-added">
                            <select
                                id="label-added"
                                className={inputClass}
                                value={addedFilter}
                                onChange={(e) => {
                                    setAddedFilter(e.target.value)
                                    setVisibleCount(20)
                                }}
                            >
                                <option value="all">All items</option>
                                <option value="today">Added today</option>
                                <option value="week">Added in the last 7 days</option>
                            </select>
                        </FormField>
                    </div>
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

                    {/* Only this box scrolls while the cursor is over it. Outside it, the page scrolls. */}
                    <div
                        data-testid="label-list-box"
                        className="h-[45vh] min-h-64 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-slate-50 p-2"
                    >
                        <ul className="space-y-2">
                            {shown.slice(0, visibleCount).map(({ variant, product }) => {
                                const { warning } = chooseSymbology(variant.barcode)
                                return (
                                    <li
                                        key={variant.id}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"
                                    >
                                        <div>
                                            <p className="font-medium">
                                                {product.name}
                                                {variant.size ? ` · Size ${variant.size}` : ''}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {variant.barcode} · Stock {stockText(variant)}
                                            </p>
                                            <p className="text-xs font-medium text-slate-700">
                                                MRP {formatINR(variant.mrpPaise)} · Price {formatINR(variant.sellingPricePaise)}
                                                {variant.unit === 'meter' ? ' / m' : ''}
                                            </p>
                                            {addedOn(variant) && (
                                                <p className="text-xs text-slate-500">
                                                    Added {formatDateTime(addedOn(variant))}
                                                </p>
                                            )}
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
                        {shown.length > visibleCount && (
                            <div className="flex flex-wrap items-center gap-2 pt-3">
                                <button
                                    type="button"
                                    className={secondaryButton}
                                    onClick={() => setVisibleCount((n) => n + 20)}
                                >
                                    Show 20 more
                                </button>
                                <button
                                    type="button"
                                    className={secondaryButton}
                                    onClick={() => setVisibleCount(shown.length)}
                                >
                                    Show all
                                </button>
                                <span className="text-sm text-slate-500">
                                    Showing {Math.min(visibleCount, shown.length)} of {shown.length}
                                </span>
                            </div>
                        )}
                    </div>
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

                <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
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