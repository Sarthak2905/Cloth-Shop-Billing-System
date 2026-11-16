import { useState } from 'react'
import FormField from './FormField'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { updateVariant } from '../db/variantRepo'
import { isBlankInput, parseMoneyInput } from '../lib/entryInput'
import { fieldErrorsFrom } from '../lib/errors'
import { paiseToRupees } from '../lib/money'

const RENAME = { costPaise: 'cost', mrpPaise: 'mrp', sellingPricePaise: 'price', taxRatePercent: 'tax' }

// Edits one stock entry: size, cost, MRP, selling price and tax. The barcode and the
// stock quantity are not edited here (stock changes through "Adjust stock").
export default function EntryEditForm({ entry, onDone }) {
    const meter = entry.unit === 'meter'
    const per = meter ? ' per meter' : ''
    const [values, setValues] = useState({
        size: entry.size ?? '',
        cost: entry.costPaise ? paiseToRupees(entry.costPaise) : '',
        mrp: paiseToRupees(entry.mrpPaise),
        price: paiseToRupees(entry.sellingPricePaise),
        tax: String(entry.taxRatePercent ?? 5),
    })
    const [errors, setErrors] = useState({})
    const [saving, setSaving] = useState(false)

    const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

    async function handleSubmit(e) {
        e.preventDefault()
        const found = {}
        const price = parseMoneyInput(values.price)
        if (price === null) found.price = 'Enter the selling price like 599 or 599.50'
        let cost = 0
        if (!isBlankInput(values.cost)) {
            cost = parseMoneyInput(values.cost)
            if (cost === null) found.cost = 'Enter the cost like 320 or 320.50'
        }
        let mrp = price
        if (!isBlankInput(values.mrp)) {
            mrp = parseMoneyInput(values.mrp)
            if (mrp === null) found.mrp = 'Enter the MRP like 799 or 799.50'
        }
        const tax = Number(values.tax)
        if (isBlankInput(values.tax) || !Number.isFinite(tax) || tax < 0 || tax > 100) {
            found.tax = 'Tax must be a number from 0 to 100'
        }
        if (Object.keys(found).length > 0) {
            setErrors(found)
            return
        }

        setErrors({})
        setSaving(true)
        try {
            await updateVariant(entry.id, {
                size: values.size.trim(),
                costPaise: cost,
                mrpPaise: mrp,
                sellingPricePaise: price,
                taxRatePercent: tax,
            })
            onDone()
        } catch (err) {
            const fe = fieldErrorsFrom(err)
            for (const [from, to] of Object.entries(RENAME)) {
                if (fe[from]) {
                    fe[to] = fe[from]
                    delete fe[from]
                }
            }
            setErrors(Object.keys(fe).length ? fe : { _form: err.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3" noValidate>
            <div className="grid grid-cols-2 gap-3">
                <FormField
                    label={meter ? 'Design / shade' : 'Size'}
                    htmlFor={`e-size-${entry.id}`}
                    error={errors.size}
                >
                    <input id={`e-size-${entry.id}`} className={inputClass} value={values.size} onChange={set('size')} />
                </FormField>
                <FormField label={`Cost (₹${per})`} htmlFor={`e-cost-${entry.id}`} error={errors.cost}>
                    <input id={`e-cost-${entry.id}`} inputMode="decimal" className={inputClass}
                        value={values.cost} onChange={set('cost')} />
                </FormField>
                <FormField label={`MRP (₹${per})`} htmlFor={`e-mrp-${entry.id}`} error={errors.mrp}>
                    <input id={`e-mrp-${entry.id}`} inputMode="decimal" className={inputClass}
                        value={values.mrp} onChange={set('mrp')} />
                </FormField>
                <FormField label={`Selling price (₹${per})`} htmlFor={`e-price-${entry.id}`} error={errors.price}>
                    <input id={`e-price-${entry.id}`} inputMode="decimal" className={inputClass}
                        value={values.price} onChange={set('price')} />
                </FormField>
                <FormField label="Tax rate (%)" htmlFor={`e-tax-${entry.id}`} error={errors.tax}>
                    <input id={`e-tax-${entry.id}`} inputMode="decimal" className={inputClass}
                        value={values.tax} onChange={set('tax')} />
                </FormField>
            </div>
            {errors._form && <p className="text-sm text-red-600">{errors._form}</p>}
            <div className="flex gap-2">
                <button type="submit" className={primaryButton} disabled={saving}>
                    Save changes
                </button>
                <button type="button" className={secondaryButton} onClick={onDone}>
                    Cancel
                </button>
            </div>
        </form>
    )
}