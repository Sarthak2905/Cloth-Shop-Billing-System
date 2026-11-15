import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, updateSettings } from '../db/settingsRepo'
import FormField from '../components/FormField'
import OwnerPinSettings from '../components/OwnerPinSettings'
import { inputClass, primaryButton } from '../components/styles'
import { fieldErrorsFrom } from '../lib/errors'
import { SETTINGS_PRINTER_CHOICES } from '../printing/printerFactory'

const FIELDS = [
    'shopName',
    'address',
    'phone',
    'taxId',
    'invoicePrefix',
    'receiptFooter',
    'receiptPaperWidth',
    'receiptPrinter',
    'receiptTextSize',
    'receiptLanguage',
    'autoPrintReceipt',
    'roundToRupee',
    'allowNegativeStock',
]

function SettingsForm({ initial }) {
    const [values, setValues] = useState(() =>
        Object.fromEntries(FIELDS.map((key) => [key, initial[key]])),
    )
    const [errors, setErrors] = useState({})
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)

    const setText = (key, transform = (v) => v) => (e) => {
        setSaved(false)
        setValues((v) => ({ ...v, [key]: transform(e.target.value) }))
    }
    const setFlag = (key) => (e) => {
        setSaved(false)
        setValues((v) => ({ ...v, [key]: e.target.checked }))
    }

    async function handleSubmit(e) {
        e.preventDefault()
        setErrors({})
        setSaved(false)
        setSaving(true)
        try {
            await updateSettings(values)
            setSaved(true)
        } catch (err) {
            const fe = fieldErrorsFrom(err)
            setErrors(Object.keys(fe).length ? fe : { _form: err.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">Shop details (printed on receipts)</p>
                <FormField label="Shop name" htmlFor="set-shop" error={errors.shopName}>
                    <input id="set-shop" className={inputClass} value={values.shopName}
                        onChange={setText('shopName')} />
                </FormField>
                <FormField label="Address" htmlFor="set-address" error={errors.address}
                    hint="Each line you type (press Enter for a new line) becomes its own centred line on the receipt.">
                    <textarea id="set-address" rows={3} className={inputClass} value={values.address}
                        onChange={setText('address')} />
                </FormField>
                <FormField label="Phone" htmlFor="set-phone" error={errors.phone}>
                    <input id="set-phone" className={inputClass} value={values.phone}
                        onChange={setText('phone')} />
                </FormField>
                <FormField label="GSTIN" htmlFor="set-gstin" error={errors.taxId}
                    hint="Leave blank if you are not registered.">
                    <input id="set-gstin" className={inputClass} value={values.taxId}
                        onChange={setText('taxId')} />
                </FormField>
                <FormField label="Receipt footer note" htmlFor="set-footer" error={errors.receiptFooter}
                    hint="Leave blank for 'Thank you! Visit again.' (or the Marathi thank-you line).">
                    <input id="set-footer" className={inputClass} value={values.receiptFooter}
                        onChange={setText('receiptFooter')} />
                </FormField>
            </div>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">Receipt printing</p>
                <FormField label="Printer" htmlFor="set-printer" error={errors.receiptPrinter}
                    hint="Choose 'Windows printer' to print on a real printer, such as your Epson TM-T88IV.">
                    <select id="set-printer" className={inputClass} value={values.receiptPrinter}
                        onChange={setText('receiptPrinter')}>
                        {Object.entries(SETTINGS_PRINTER_CHOICES).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </FormField>
                <FormField label="Receipt paper width" htmlFor="set-paper" error={errors.receiptPaperWidth}
                    hint="For the Epson TM-T88IV choose an 80 mm option.">
                    <select id="set-paper" className={inputClass} value={values.receiptPaperWidth}
                        onChange={setText('receiptPaperWidth')}>
                        <option value="58">58 mm (32 characters)</option>
                        <option value="80">80 mm (48 characters)</option>
                        <option value="80-42">80 mm (42 characters), Epson TM-T88III/IV</option>
                    </select>
                </FormField>
                <FormField label="Receipt text size" htmlFor="set-textsize" error={errors.receiptTextSize}
                    hint="Bigger text is easier to read. Normal fits the most on one line.">
                    <select id="set-textsize" className={inputClass} value={values.receiptTextSize}
                        onChange={setText('receiptTextSize')}>
                        <option value="normal">Normal</option>
                        <option value="large">Large</option>
                        <option value="extra">Extra large</option>
                    </select>
                </FormField>
                <FormField label="Receipt language" htmlFor="set-language" error={errors.receiptLanguage}
                    hint="The language of the labels on the printed receipt (Invoice, Total, GST...).">
                    <select id="set-language" className={inputClass} value={values.receiptLanguage}
                        onChange={setText('receiptLanguage')}>
                        <option value="en">English</option>
                        <option value="mr">मराठी (Marathi)</option>
                    </select>
                </FormField>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={values.autoPrintReceipt}
                        onChange={setFlag('autoPrintReceipt')} />
                    Print the receipt automatically after every sale
                </label>
            </div>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">Billing</p>
                <FormField label="Invoice prefix" htmlFor="set-prefix" error={errors.invoicePrefix}
                    hint="1-6 capital letters or digits. Changing it does not restart the numbering.">
                    <input id="set-prefix" className={inputClass} value={values.invoicePrefix}
                        onChange={setText('invoicePrefix', (v) => v.toUpperCase())} />
                </FormField>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={values.roundToRupee} onChange={setFlag('roundToRupee')} />
                    Round the bill total to the nearest rupee
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={values.allowNegativeStock}
                        onChange={setFlag('allowNegativeStock')} />
                    Allow selling more than the stock in hand
                </label>
            </div>

            {errors._form && <p className="text-sm text-red-600">{errors._form}</p>}
            {saved && (
                <p role="status" className="rounded-lg bg-green-100 p-3 text-sm text-green-800">
                    Settings saved
                </p>
            )}

            <button type="submit" className={primaryButton} disabled={saving}>
                Save settings
            </button>
        </form>
    )
}

export default function SettingsPage() {
    const settings = useLiveQuery(() => getSettings(), [])

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Settings</h2>
            {settings === undefined ? (
                <p className="text-slate-500">Loading...</p>
            ) : (
                <SettingsForm initial={settings} />
            )}
            <OwnerPinSettings />
        </div>
    )
}