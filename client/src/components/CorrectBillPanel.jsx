import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CANCEL_REASONS } from '../db/correctionRepo'
import { hasOwnerPin, verifyOwnerPin } from '../security/ownerPin'
import FormField from './FormField'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { AppError } from '../lib/errors'

export default function CorrectBillPanel({ invoiceNumber, onAuthorized }) {
    const hasPin = useLiveQuery(() => hasOwnerPin(), [])
    const [choice, setChoice] = useState(CANCEL_REASONS[0])
    const [otherText, setOtherText] = useState('')
    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    if (hasPin === undefined) return <p className="text-slate-500">Loading...</p>

    if (!hasPin) {
        return (
            <div className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
                <p className="text-sm">Set an owner PIN in Settings first, then come back to correct this bill.</p>
                <Link to="/settings" className={secondaryButton}>
                    Go to Settings
                </Link>
            </div>
        )
    }

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        const reason = choice === 'Other' ? otherText.trim() : choice
        if (!reason) {
            setError('Please write the reason')
            return
        }
        setBusy(true)
        try {
            await verifyOwnerPin(pin)
            setPin('')
            onAuthorized({ reason })
        } catch (err) {
            setPin('')
            if (!(err instanceof AppError)) console.error(err)
            setError(err instanceof AppError ? err.message : 'Could not check the PIN')
        } finally {
            setBusy(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm" noValidate>
            <p className="font-semibold">Correct {invoiceNumber}</p>
            <p className="text-sm text-slate-600">
                The old bill is cancelled and a new bill with a new invoice number is made. The owner PIN is required.
            </p>
            <FormField label="Reason" htmlFor="cb-reason">
                <select id="cb-reason" className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)}>
                    {CANCEL_REASONS.map((r) => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>
            </FormField>
            {choice === 'Other' && (
                <FormField label="Write the reason" htmlFor="cb-other">
                    <input id="cb-other" className={inputClass} maxLength={80} value={otherText}
                        onChange={(e) => setOtherText(e.target.value)} />
                </FormField>
            )}
            <FormField label="Owner PIN" htmlFor="cb-pin">
                <input id="cb-pin" className={inputClass} type="password" inputMode="numeric" maxLength={6}
                    autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
            </FormField>
            {error && (
                <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                    {error}
                </p>
            )}
            <button type="submit" className={primaryButton} disabled={busy}>
                Continue
            </button>
        </form>
    )
}