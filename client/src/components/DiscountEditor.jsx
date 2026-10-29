import { useState } from 'react'
import { inputClass, primaryButton, secondaryButton } from './styles'
import { paiseToRupees, rupeesToPaise } from '../lib/money'

// `onApply(discountOrNull)` must return an error message, or null when it worked.
export default function DiscountEditor({ label, discount, onApply }) {
    const [type, setType] = useState(discount?.type ?? 'percent')
    const [text, setText] = useState(() => {
        if (!discount) return ''
        return discount.type === 'amount' ? paiseToRupees(discount.value) : String(discount.value)
    })
    const [error, setError] = useState('')

    function handleApply(e) {
        e.preventDefault()
        setError('')

        let next = null
        if (text.trim() !== '') {
            if (type === 'percent') {
                const value = Number(text)
                if (!Number.isFinite(value)) {
                    setError('Enter a valid percent')
                    return
                }
                next = { type, value }
            } else {
                try {
                    next = { type, value: rupeesToPaise(text) }
                } catch {
                    setError('Enter an amount like 100 or 99.50')
                    return
                }
            }
        }

        const message = onApply(next)
        if (message) setError(message)
    }

    function handleClear() {
        setText('')
        setError('')
        onApply(null)
    }

    return (
        <form onSubmit={handleApply} className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3" noValidate>
            <div className="flex gap-2">
                <select
                    aria-label={`${label} type`}
                    className="rounded-lg border border-slate-300 px-2 py-2"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                >
                    <option value="percent">%</option>
                    <option value="amount">₹</option>
                </select>
                <input
                    aria-label={`${label} value`}
                    inputMode="decimal"
                    className={inputClass}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={type === 'percent' ? 'e.g. 5' : 'e.g. 100'}
                />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
                <button type="submit" className={primaryButton}>
                    Apply
                </button>
                <button type="button" className={secondaryButton} onClick={handleClear}>
                    Clear
                </button>
            </div>
        </form>
    )
}