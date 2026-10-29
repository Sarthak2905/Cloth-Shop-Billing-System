import { useState } from 'react'
import FormField from './FormField'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { fieldErrorsFrom } from '../lib/errors'
import { paiseToRupees, rupeesToPaise } from '../lib/money'
import { generateBarcode } from '../db/variantRepo'

const AMOUNT_ERROR = 'Enter an amount like 499 or 499.50'
const RENAME = { costPaise: 'cost', mrpPaise: 'mrp', sellingPricePaise: 'price' }

export default function VariantForm({ initial, onSubmit, onCancel }) {
    const isEdit = Boolean(initial)
    const [values, setValues] = useState({
        sku: initial?.sku ?? '',
        barcode: initial?.barcode ?? '',
        size: initial?.size ?? '',
        cost: initial ? paiseToRupees(initial.costPaise) : '',
        mrp: initial ? paiseToRupees(initial.mrpPaise) : '',
        price: initial ? paiseToRupees(initial.sellingPricePaise) : '',
        taxRatePercent: String(initial?.taxRatePercent ?? 5),
        priceIncludesTax: initial?.priceIncludesTax ?? true,
        reorderThreshold: String(initial?.reorderThreshold ?? 3),
        openingStock: '0',
    })
    const [errors, setErrors] = useState({})
    const [saving, setSaving] = useState(false)

    const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

    async function handleGenerate() {
        const code = await generateBarcode()
        setValues((v) => ({ ...v, barcode: code }))
    }

    async function handleSubmit(e) {
        e.preventDefault()
        setErrors({})

        const amountErrors = {}
        const toPaise = (key) => {
            try {
                return rupeesToPaise(values[key])
            } catch {
                amountErrors[key] = AMOUNT_ERROR
                return 0
            }
        }

        const payload = {
            sku: values.sku,
            barcode: values.barcode,
            size: values.size,
            costPaise: toPaise('cost'),
            mrpPaise: toPaise('mrp'),
            sellingPricePaise: toPaise('price'),
            taxRatePercent: Number(values.taxRatePercent),
            priceIncludesTax: values.priceIncludesTax,
            reorderThreshold: Number(values.reorderThreshold),
        }
        if (!isEdit) payload.openingStock = Number(values.openingStock)

        if (Object.keys(amountErrors).length) {
            setErrors(amountErrors)
            return
        }

        setSaving(true)
        try {
            await onSubmit(payload)
        } catch (err) {
            const fe = fieldErrorsFrom(err)
            for (const [from, to] of Object.entries(RENAME)) {
                if (fe[from]) {
                    fe[to] = fe[from]
                    delete fe[from]
                }
            }
            if (err.code === 'DUPLICATE_BARCODE') fe.barcode = err.message
            else if (err.code === 'DUPLICATE_SKU') fe.sku = err.message
            else if (err.code === 'DUPLICATE_VARIANT') fe.size = err.message
            setErrors(Object.keys(fe).length ? fe : { _form: err.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div className="grid grid-cols-2 gap-3">
                <FormField label="Size" htmlFor="v-size" error={errors.size}>
                    <input id="v-size" className={inputClass} value={values.size}
                        onChange={set('size')} placeholder="M" />
                </FormField>
                <FormField label="Colour" htmlFor="v-colour" error={errors.colour}>
                    <input id="v-colour" className={inputClass} value={values.colour}
                        onChange={set('colour')} placeholder="Blue" />
                </FormField>
            </div>

            <FormField label="SKU" htmlFor="v-sku" error={errors.sku}>
                <input id="v-sku" className={inputClass} value={values.sku}
                    onChange={set('sku')} placeholder="SHIRT-BLU-M" />
            </FormField>

            <FormField
                label="Barcode"
                htmlFor="v-barcode"
                error={errors.barcode}
                hint="Internal code for your own labels. Use Generate, or type a manufacturer barcode."
            >
                <div className="flex gap-2">
                    <input id="v-barcode" className={inputClass} value={values.barcode}
                        onChange={set('barcode')} />
                    <button type="button" className={secondaryButton} onClick={handleGenerate}>
                        Generate
                    </button>
                </div>
            </FormField>

            <div className="grid grid-cols-3 gap-3">
                <FormField label="Cost (₹)" htmlFor="v-cost" error={errors.cost}>
                    <input id="v-cost" inputMode="decimal" className={inputClass}
                        value={values.cost} onChange={set('cost')} />
                </FormField>
                <FormField label="MRP (₹)" htmlFor="v-mrp" error={errors.mrp}>
                    <input id="v-mrp" inputMode="decimal" className={inputClass}
                        value={values.mrp} onChange={set('mrp')} />
                </FormField>
                <FormField label="Selling (₹)" htmlFor="v-price" error={errors.price}>
                    <input id="v-price" inputMode="decimal" className={inputClass}
                        value={values.price} onChange={set('price')} />
                </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <FormField
                    label="Tax rate (%)"
                    htmlFor="v-tax"
                    error={errors.taxRatePercent}
                    hint="Check the correct GST rate for this item."
                >
                    <input id="v-tax" inputMode="decimal" className={inputClass}
                        value={values.taxRatePercent} onChange={set('taxRatePercent')} />
                </FormField>
                <FormField label="Low-stock alert at" htmlFor="v-reorder" error={errors.reorderThreshold}>
                    <input id="v-reorder" inputMode="numeric" className={inputClass}
                        value={values.reorderThreshold} onChange={set('reorderThreshold')} />
                </FormField>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                    type="checkbox"
                    checked={values.priceIncludesTax}
                    onChange={(e) => setValues((v) => ({ ...v, priceIncludesTax: e.target.checked }))}
                />
                Selling price already includes tax
            </label>

            {!isEdit && (
                <FormField label="Opening stock" htmlFor="v-opening" error={errors.openingStock}>
                    <input id="v-opening" inputMode="numeric" className={inputClass}
                        value={values.openingStock} onChange={set('openingStock')} />
                </FormField>
            )}

            {errors._form && <p className="text-sm text-red-600">{errors._form}</p>}

            <div className="flex gap-2">
                <button type="submit" className={primaryButton} disabled={saving}>
                    {isEdit ? 'Save changes' : 'Add variant'}
                </button>
                <button type="button" className={secondaryButton} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    )
}