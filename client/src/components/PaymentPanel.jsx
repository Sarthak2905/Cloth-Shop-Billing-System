import { useState } from 'react'
import FormField from './FormField'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { PAYMENT_LABEL } from '../lib/format'
import { formatINR, rupeesToPaise } from '../lib/money'

function parseAmount(text) {
    if (text.trim() === '') return { value: null }
    try {
        return { value: rupeesToPaise(text) }
    } catch {
        return { invalid: true }
    }
}

// `onComplete(payment)` must return an error message, or null when it worked.
export default function PaymentPanel({ totalPaise, onComplete }) {
    const [method, setMethod] = useState('cash')
    const [tendered, setTendered] = useState('')
    const [reference, setReference] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const parsed = parseAmount(tendered)
    const changeDue =
        method === 'cash' && parsed.value !== null && !parsed.invalid && parsed.value >= totalPaise
            ? parsed.value - totalPaise
            : null

    async function handleSubmit(e) {
        e.preventDefault()
        if (saving) return
        setError('')

        if (method === 'cash' && parsed.invalid) {
            setError('Enter the cash received like 500 or 500.50')
            return
        }

        const payment = { method }
        if (method === 'cash') payment.amountTenderedPaise = parsed.value ?? totalPaise
        if (reference.trim()) payment.reference = reference.trim()

        setSaving(true)
        try {
            const message = await onComplete(payment)
            if (message) {
                setError(message)
            } else {
                setTendered('')
                setReference('')
            }
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm" noValidate>
            <p className="font-semibold">Payment</p>

            <div className="flex gap-2">
                {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={method === value}
                        className={method === value ? primaryButton : secondaryButton}
                        onClick={() => setMethod(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {method === 'cash' ? (
                <FormField
                    label="Cash received"
                    htmlFor="pay-cash"
                    hint="Leave blank if the customer pays the exact total."
                >
                    <input
                        id="pay-cash"
                        inputMode="decimal"
                        className={inputClass}
                        value={tendered}
                        onChange={(e) => setTendered(e.target.value)}
                        placeholder={formatINR(totalPaise)}
                    />
                </FormField>
            ) : (
                <FormField label="Reference (optional)" htmlFor="pay-ref" hint="For example the UPI transaction id. Never enter card numbers.">
                    <input
                        id="pay-ref"
                        className={inputClass}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                    />
                </FormField>
            )}

            {changeDue !== null && (
                <p className="text-lg font-semibold">Change due: {formatINR(changeDue)}</p>
            )}
            {error && (
                <p role="alert" className="text-sm text-red-600">
                    {error}
                </p>
            )}

            <button type="submit" className={primaryButton} disabled={saving}>
                {saving ? 'Saving...' : 'Complete sale'}
            </button>
        </form>
    )
}