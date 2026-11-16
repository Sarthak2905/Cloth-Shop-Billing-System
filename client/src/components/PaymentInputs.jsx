import { inputClass } from './styles'

// Three boxes: how much was received as cash, UPI and card. A bill can be paid in parts.
export default function PaymentInputs({ idPrefix = 'pay', form, onChange }) {
    const set = (key) => (e) => onChange({ ...form, [key]: e.target.value })

    const box = (key, label) => (
        <div key={key}>
            <label htmlFor={`${idPrefix}-${key}`} className="text-xs font-medium text-slate-600">
                {label}
            </label>
            <input
                id={`${idPrefix}-${key}`}
                inputMode="decimal"
                autoComplete="off"
                className={`${inputClass} mt-1 text-right`}
                value={form[key]}
                onChange={set(key)}
                placeholder="₹"
            />
        </div>
    )

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
                {box('cash', 'Cash')}
                {box('upi', 'UPI')}
                {box('card', 'Card')}
            </div>
            {form.upi.trim() !== '' && (
                <div>
                    <label htmlFor={`${idPrefix}-upiRef`} className="text-xs font-medium text-slate-600">
                        UPI reference (optional)
                    </label>
                    <input
                        id={`${idPrefix}-upiRef`}
                        autoComplete="off"
                        maxLength={40}
                        className={`${inputClass} mt-1`}
                        value={form.upiRef}
                        onChange={set('upiRef')}
                    />
                </div>
            )}
        </div>
    )
}