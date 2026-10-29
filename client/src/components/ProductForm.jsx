import { useState } from 'react'
import FormField from './FormField'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { fieldErrorsFrom } from '../lib/errors'

export default function ProductForm({
    initial,
    onSubmit,
    onCancel,
    submitLabel = 'Save product',
}) {
    const [values, setValues] = useState({
        name: initial?.name ?? '',
        category: initial?.category ?? '',
        brand: initial?.brand ?? '',
        supplier: initial?.supplier ?? '',
    })
    const [errors, setErrors] = useState({})
    const [saving, setSaving] = useState(false)

    const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }))

    async function handleSubmit(e) {
        e.preventDefault()
        setSaving(true)
        setErrors({})
        try {
            await onSubmit(values)
        } catch (err) {
            const fe = fieldErrorsFrom(err)
            setErrors(Object.keys(fe).length ? fe : { _form: err.message })
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <FormField label="Product name" htmlFor="p-name" error={errors.name}>
                <input id="p-name" className={inputClass} value={values.name}
                    onChange={set('name')} placeholder="e.g. Cotton Shirt" />
            </FormField>
            <FormField label="Category" htmlFor="p-category" error={errors.category}>
                <input id="p-category" className={inputClass} value={values.category}
                    onChange={set('category')} placeholder="e.g. Shirts" />
            </FormField>
            <FormField label="Brand (optional)" htmlFor="p-brand" error={errors.brand}>
                <input id="p-brand" className={inputClass} value={values.brand} onChange={set('brand')} />
            </FormField>
            <FormField label="Supplier (optional)" htmlFor="p-supplier" error={errors.supplier}>
                <input id="p-supplier" className={inputClass} value={values.supplier} onChange={set('supplier')} />
            </FormField>

            {errors._form && <p className="text-sm text-red-600">{errors._form}</p>}

            <div className="flex gap-2">
                <button type="submit" className={primaryButton} disabled={saving}>
                    {submitLabel}
                </button>
                {onCancel && (
                    <button type="button" className={secondaryButton} onClick={onCancel}>
                        Cancel
                    </button>
                )}
            </div>
        </form>
    )
}