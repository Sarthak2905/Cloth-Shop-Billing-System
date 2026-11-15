import { useState } from 'react'
import FormField from './FormField'
import { inputClass, primaryButton } from './styles'
import { PAYMENT_LABEL } from '../lib/format'
import { formatINR } from '../lib/money'

// Payment for a corrected bill. The customer has already paid the old bill, so this
// shows only the difference to collect or refund, and records how the bill is paid.
export default function CorrectionPayment({ totalPaise, oldTotalPaise, onComplete }) {
    const [method, setMethod] = useState('cash')
    const [reference, setReference] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const difference = totalPaise - oldTotalPaise

    async function handleSubmit(e) {
        e.preventDefault()
        if (saving) return
        setSaving(true)
        setError('')
        const message = await onComplete({
            method,
            amountTenderedPaise: totalPaise,
            reference: method === 'cash' ? '' : reference.trim(),
        })
        if (message) {
            setError(message)
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
            <p
                data-testid="correction-difference"
                className="text-lg font-semibold"
            >
                {difference > 0 && `Collect ${formatINR(difference)} more from the customer`}
                {difference < 0 && `Refund ${formatINR(-difference)} to the customer`}
                {difference === 0 && 'Same total as before. Nothing to collect or refund.'}
            </p>
            <FormField label="Payment method" htmlFor="corr-method">
                <select id="corr-method" className={inputClass} value={method}
                    onChange={(e) => setMethod(e.target.value)}>
                    {['cash', 'upi', 'card'].map((m) => (
                        <option key={m} value={m}>
                            {PAYMENT_LABEL[m]}
                        </option>
                    ))}
                </select>
            </FormField>
            {method !== 'cash' && (
                <FormField label="Reference (optional)" htmlFor="corr-ref">
                    <input id="corr-ref" className={inputClass} maxLength={40} value={reference}
                        onChange={(e) => setReference(e.target.value)} />
                </FormField>
            )}
            {error && (
                <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                    {error}
                </p>
            )}
            <button type="submit" className={primaryButton} disabled={saving}>
                Save corrected bill
            </button>
        </form>
    )
}