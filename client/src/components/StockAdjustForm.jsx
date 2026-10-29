import { useState } from 'react'
import FormField from './FormField'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { adjustStock } from '../db/variantRepo'

export default function StockAdjustForm({ variant, onDone }) {
    const [change, setChange] = useState('')
    const [reason, setReason] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setSaving(true)
        try {
            await adjustStock({
                variantId: variant.id,
                quantityChange: Number(change),
                type: 'adjustment',
                reason,
            })
            onDone()
        } catch (err) {
            setError(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3" noValidate>
            <FormField
                label="Quantity change"
                htmlFor="adjust-qty"
                hint="Use + to add, - to remove. Example: -2 for two damaged pieces."
            >
                <input id="adjust-qty" inputMode="numeric" className={inputClass}
                    value={change} onChange={(e) => setChange(e.target.value)} />
            </FormField>
            <FormField label="Reason" htmlFor="adjust-reason">
                <input id="adjust-reason" className={inputClass} value={reason}
                    onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged, stock count correction" />
            </FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
                <button type="submit" className={primaryButton} disabled={saving}>
                    Apply
                </button>
                <button type="button" className={secondaryButton} onClick={onDone}>
                    Cancel
                </button>
            </div>
        </form>
    )
}