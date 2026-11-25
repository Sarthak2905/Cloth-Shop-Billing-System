import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { checkHelper, sendToHelper } from '../labels/helperClient'
import { LABEL_PRESETS, validateLabelSize } from '../labels/labelModel'
import { loadLabelPrefs, saveLabelPrefs } from '../labels/labelPrefs'
import { buildTestPrintJob } from '../labels/printJob'
import { loadPrinterSettings, savePrinterSettings, tsplOptions } from '../labels/printerSettings'
import FormField from './FormField'
import { inputClass, secondaryButton } from './styles'
import { buildCalibrateJob } from '../labels/calibrate'

const HEADER_KEY = 'labelHeader'
const HEADER_MAX = 30

// Set once: label size, price shown, name at the top, and the direct printer. Used on the Settings page.
export default function LabelSettings() {
    const [prefs, setPrefs] = useState(() => loadLabelPrefs())
    const [header, setHeader] = useState('')
    const [printer, setPrinter] = useState(() => loadPrinterSettings())
    const [status, setStatus] = useState(null)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        let cancelled = false
        db.settings
            .get(HEADER_KEY)
            .then((row) => {
                if (!cancelled) setHeader(typeof row?.value === 'string' ? row.value : '')
            })
            .catch(() => { })
        return () => {
            cancelled = true
        }
    }, [])

    function changePrefs(patch) {
        setPrefs((current) => {
            const next = { ...current, ...patch }
            saveLabelPrefs(next)
            return next
        })
    }

    function changeHeader(text) {
        const value = text.slice(0, HEADER_MAX)
        setHeader(value)
        db.settings.put({ key: HEADER_KEY, value }).catch(() => { })
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

    const preset = LABEL_PRESETS.find((p) => p.id === (prefs.presetId || LABEL_PRESETS[0].id))
    const widthMm = preset ? preset.widthMm : Number(prefs.customWidth)
    const heightMm = preset ? preset.heightMm : Number(prefs.customHeight)
    const sizeError = validateLabelSize(widthMm, heightMm)

    async function run(action, doneText) {
        setBusy(true)
        setStatus(null)
        try {
            const result = await action()
            setStatus({ type: 'ok', text: doneText(result) })
        } catch (err) {
            setStatus({ type: 'error', text: err?.message || 'Something went wrong' })
        } finally {
            setBusy(false)
        }
    }

    const handleCheck = () =>
        run(
            () => checkHelper(printer.helperUrl),
            (info) => `Connected to the label helper. Printer: ${info?.printer ?? 'unknown'}`,
        )

    const handleTestPrint = () =>
        run(
            async () => {
                const bytes = await buildTestPrintJob({ widthMm, heightMm, options: tsplOptions(printer) })
                await sendToHelper(printer.helperUrl, bytes, { printerName: printer.printerName })
            },
            () => 'Test label sent to the printer',
        )
    const handleCalibrate = () =>
        run(
            () =>
                sendToHelper(
                    printer.helperUrl,
                    buildCalibrateJob({ widthMm, heightMm, gapMm: printer.gapMm }),
                    { printerName: printer.printerName },
                ),
            () => 'Calibration sent. The printer feeds a few stickers and stops.',
        )

    return (
        <section className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
            <h3 className="text-lg font-bold">Barcode labels</h3>
            <p className="text-sm text-slate-600">
                Set these once for this computer. The Labels page then only needs you to choose items and press Print.
            </p>

            <FormField label="Label size" htmlFor="label-size" hint="Choose the size of the sticker on your roll.">
                <select
                    id="label-size"
                    className={inputClass}
                    value={preset ? preset.id : 'custom'}
                    onChange={(e) => changePrefs({ presetId: e.target.value })}
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
                            value={prefs.customWidth}
                            onChange={(e) => changePrefs({ customWidth: e.target.value })}
                        />
                    </FormField>
                    <FormField label="Height (mm)" htmlFor="label-height">
                        <input
                            id="label-height"
                            inputMode="decimal"
                            className={inputClass}
                            value={prefs.customHeight}
                            onChange={(e) => changePrefs({ customHeight: e.target.value })}
                        />
                    </FormField>
                </div>
            )}
            {sizeError && <p className="text-sm text-red-600">{sizeError}</p>}

            <FormField label="Price on label" htmlFor="label-price-mode">
                <select
                    id="label-price-mode"
                    className={inputClass}
                    value={prefs.priceMode}
                    onChange={(e) => changePrefs({ priceMode: e.target.value })}
                >
                    <option value="mrp">MRP</option>
                    <option value="selling">Selling price</option>
                    <option value="none">No price</option>
                </select>
            </FormField>

            <FormField
                label="Name at the top of the label"
                htmlFor="label-header"
                hint="Printed at the top of every label, for example your shop name. Leave empty for none."
            >
                <input
                    id="label-header"
                    className={inputClass}
                    maxLength={HEADER_MAX}
                    autoComplete="off"
                    value={header}
                    onChange={(e) => changeHeader(e.target.value)}
                    placeholder="SG Dhokate"
                />
            </FormField>

            <details className="rounded-lg border border-slate-200 p-3" open>
                <summary className="cursor-pointer font-semibold">
                    Direct printing to the label printer {printer.direct ? '(on)' : '(off)'}
                </summary>
                <div className="mt-3 space-y-3">
                    <p className="text-sm text-slate-600">
                        Sends each label straight to the printer, with no print window and no paper size or
                        orientation to choose. It needs the label helper installed on this computer.
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
                        hint="Leave empty to use the printer the helper was installed with."
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
                                                <button
                            type="button"
                            className={secondaryButton}
                            disabled={busy || Boolean(sizeError)}
                            onClick={handleCalibrate}
                        >
                            Calibrate label sensor
                        </button>
                    </div>
                </div>
            </details>

            {status && (
                <p
                    role={status.type === 'error' ? 'alert' : 'status'}
                    className={`rounded-lg p-3 text-sm ${status.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}
                >
                    {status.text}
                </p>
            )}
        </section>
    )
}