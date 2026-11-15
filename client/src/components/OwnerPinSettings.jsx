import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { hasOwnerPin, setOwnerPin } from '../security/ownerPin'
import FormField from './FormField'
import { inputClass, primaryButton } from './styles'
import { AppError } from '../lib/errors'

const pinProps = { type: 'password', inputMode: 'numeric', maxLength: 6, autoComplete: 'off' }

export default function OwnerPinSettings() {
    const hasPin = useLiveQuery(() => hasOwnerPin(), [])
    const [current, setCurrent] = useState('')
    const [pin, setPin] = useState('')
    const [confirm, setConfirm] = useState('')
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setSaved(false)
        if (pin !== confirm) {
            setError('The two PINs do not match')
            return
        }
        setSaving(true)
        try {
            await setOwnerPin(pin, { currentPin: current })
            setSaved(true)
            setCurrent('')
            setPin('')
            setConfirm('')
        } catch (err) {
            if (!(err instanceof AppError)) console.error(err)
            setError(err instanceof AppError ? err.message : 'Could not save the PIN')
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm" noValidate>
            <p className="font-semibold">Owner PIN</p>
            <p className="text-sm text-slate-600">
                Needed to correct a bill after it was given to the customer. 4 to 6 digits.
                {hasPin === false && ' No PIN is set yet.'}
            </p>
            {hasPin && (
                <FormField label="Current PIN" htmlFor="pin-current">
                    <input id="pin-current" className={inputClass} {...pinProps} value={current}
                        onChange={(e) => setCurrent(e.target.value)} />
                </FormField>
            )}
            <FormField label="New PIN" htmlFor="pin-new">
                <input id="pin-new" className={inputClass} {...pinProps} value={pin}
                    onChange={(e) => setPin(e.target.value)} />
            </FormField>
            <FormField label="Confirm new PIN" htmlFor="pin-confirm">
                <input id="pin-confirm" className={inputClass} {...pinProps} value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} />
            </FormField>
            {error && (
                <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                    {error}
                </p>
            )}
            {saved && (
                <p role="status" className="rounded-lg bg-green-100 p-3 text-sm text-green-800">
                    Owner PIN saved
                </p>
            )}
            <button type="submit" className={primaryButton} disabled={saving}>
                {hasPin ? 'Change PIN' : 'Set PIN'}
            </button>
        </form>
    )
}