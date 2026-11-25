import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { findCustomers } from '../db/customerRepo'
import { checkPhone, normalizePhone } from '../lib/customer'
import { formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'
import { inputClass } from './styles'

// Optional customer on a bill. Typing a name or number suggests earlier customers.
export default function CustomerBox({ value, onChange }) {
    const [open, setOpen] = useState(false)
    const text = value.phone.trim().length >= 3 ? value.phone : value.name.trim().length >= 2 ? value.name : ''
    const suggestions = useLiveQuery(() => findCustomers(text, 5), [text]) ?? []
    const { error } = checkPhone(value.phone)
    const typedPhone = normalizePhone(value.phone)
    const known = typedPhone.length === 10 ? suggestions.find((c) => c.phone === typedPhone) : null

    function pick(c) {
        onChange({ name: c.name, phone: c.phone })
        setOpen(false)
        document.getElementById('bill-barcode')?.focus()
    }

    return (
        <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
            <p className="font-semibold">Customer (optional)</p>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label htmlFor="cust-name" className="sr-only">
                        Customer name
                    </label>
                    <input
                        id="cust-name"
                        className={inputClass}
                        value={value.name}
                        maxLength={60}
                        autoComplete="off"
                        placeholder="Name"
                        onChange={(e) => {
                            onChange({ ...value, name: e.target.value })
                            setOpen(true)
                        }}
                        onBlur={() => setOpen(false)}
                    />
                </div>
                <div>
                    <label htmlFor="cust-phone" className="sr-only">
                        Customer mobile number
                    </label>
                    <input
                        id="cust-phone"
                        className={inputClass}
                        value={value.phone}
                        inputMode="tel"
                        maxLength={16}
                        autoComplete="off"
                        placeholder="Mobile number"
                        onChange={(e) => {
                            onChange({ ...value, phone: e.target.value })
                            setOpen(true)
                        }}
                        onBlur={() => setOpen(false)}
                    />
                </div>
            </div>
            {error && (
                <p role="alert" className="text-sm text-red-600">
                    {error}
                </p>
            )}
            {open && suggestions.length > 0 && (
                <ul className="space-y-1">
                    {suggestions.map((c) => (
                        <li key={c.key}>
                            <button
                                type="button"
                                // mouse down, so the box does not close before the click is counted
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    pick(c)
                                }}
                                className="flex w-full justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                                <span>
                                    <span className="font-medium">{c.name || 'No name'}</span>
                                    <span className="block text-xs text-slate-500">{c.phone || 'No number'}</span>
                                </span>
                                <span className="text-xs text-slate-500">{c.visits} bills</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {known && (
                <p className="rounded-lg bg-blue-50 p-2 text-sm text-blue-900">
                    Returning customer · {known.visits} earlier {known.visits === 1 ? 'bill' : 'bills'} · last{' '}
                    {formatDateTime(known.lastAt)}
                    {known.pendingPaise > 0 && (
                        <span className="font-semibold text-amber-800"> · {formatINR(known.pendingPaise)} pending</span>
                    )}{' '}
                    <Link to={`/customers/${encodeURIComponent(known.key)}`} className="font-semibold underline">
                        See what they bought
                    </Link>
                </p>
            )}
        </div>
    )
}