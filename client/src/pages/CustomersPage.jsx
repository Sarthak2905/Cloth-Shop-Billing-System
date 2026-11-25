import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listCustomers } from '../db/customerRepo'
import { normalizePhone } from '../lib/customer'
import { formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'
import Avatar from '../components/Avatar'
import { inputClass } from '../components/styles'

export default function CustomersPage() {
    const customers = useLiveQuery(() => listCustomers(), [])
    const [search, setSearch] = useState('')
    const q = search.trim().toLowerCase()
    const digits = normalizePhone(q)
    const shown = (customers ?? []).filter(
        (c) => !q || c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.includes(digits)),
    )

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-2xl font-bold text-slate-900">Customers</h2>
                {customers && customers.length > 0 && (
                    <p className="text-sm text-slate-500">
                        {customers.length} {customers.length === 1 ? 'customer' : 'customers'}
                    </p>
                )}
            </div>

            <input
                aria-label="Search customers"
                className={`${inputClass} py-3!`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or mobile number"
            />

            {customers === undefined && <p className="text-slate-500">Loading...</p>}
            {customers && shown.length === 0 && (
                <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
                    <p className="text-lg font-semibold text-slate-700">
                        {q ? 'No customer matches your search.' : 'No customers yet.'}
                    </p>
                    {!q && (
                        <p className="mt-1 text-sm text-slate-500">
                            Type a name or mobile number on the billing screen and they will appear here.
                        </p>
                    )}
                </div>
            )}

            <ul className="space-y-2">
                {shown.map((c) => (
                    <li key={c.key}>
                        <Link
                            to={`/customers/${encodeURIComponent(c.key)}`}
                            className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
                        >
                            <Avatar name={c.name} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-bold text-slate-900">{c.name || 'No name'}</p>
                                <p className="truncate text-sm text-slate-600">{c.phone || 'No number'}</p>
                                <p className="text-xs text-slate-500">
                                    {c.visits} {c.visits === 1 ? 'bill' : 'bills'} · last {formatDateTime(c.lastAt)}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="text-lg font-bold text-slate-900">{formatINR(c.totalPaise)}</p>
                                {c.pendingPaise > 0 && (
                                    <p className="mt-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                        {formatINR(c.pendingPaise)} pending
                                    </p>
                                )}
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}