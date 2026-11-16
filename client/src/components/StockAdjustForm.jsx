import { useState } from 'react'
import FormField from './FormField'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { adjustStock } from '../db/variantRepo'
import { parseSignedMeters } from '../lib/signedMeters'

export default function StockAdjustForm({ variant, onDone }) {
    const meter = variant.unit === 'meter'
    const [change, setChange] = useState('')
    const [reason, setReason] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')

        // Fabric is typed in meters (-2.5) and kept as whole centimetres.
        let quantityChange
        if (meter) {
            quantityChange = parseSignedMeters(change)
            if (quantityChange === null) {
                setError('Enter a length like -2.5 or 10')
                return
            }
            if (quantityChange === 0) {
                setError('Enter a length other than zero')
                return
            }
        } else {
            quantityChange = Number(change)
        }

        setSaving(true)
        try {
            await adjustStock({
                variantId: variant.id,
                quantityChange,
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
                label={meter ? 'Change in meters' : 'Quantity change'}
                htmlFor="adjust-qty"
                hint={
                    meter
                        ? 'Use + to add, - to remove. Example: -2.5 for 2.5 m cut by mistake, or -80 cm.'
                        : 'Use + to add, - to remove. Example: -2 for two damaged pieces.'
                }
            >
                <input id="adjust-qty" inputMode={meter ? 'decimal' : 'numeric'} className={inputClass}
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