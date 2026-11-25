import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSales } from '../db/saleRepo'
import { saleMatches } from '../lib/customer'
import { formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'
import { paymentText } from '../lib/payments'
import { DATE_CHOICES, inRange, rangeFor, summarizeSales } from '../lib/salesFilter'
import { inputClass } from '../components/styles'

const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// "Today", "Yesterday" or "Mon, 24 Nov 2026".
function dayLabel(iso, now = new Date()) {
    const day = new Date(iso)
    if (sameDay(day, now)) return 'Today'
    if (sameDay(day, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Yesterday'
    return day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// Bills are newest first, so each day comes out as one group.
function groupByDay(sales) {
    const groups = []
    for (const sale of sales) {
        const label = dayLabel(sale.createdAt)
        const last = groups.at(-1)
        if (last && last.label === label) last.sales.push(sale)
        else groups.push({ label, sales: [sale] })
    }
    return groups
}

export default function SalesPage() {
    const [params, setParams] = useSearchParams()
    const filter = params.get('filter') === 'pending' ? 'pending' : 'all'
    const [search, setSearch] = useState('')
    const [dateKind, setDateKind] = useState('all')
    const [from, setFrom] = useState('')
    const [to, setTo] = useState('')

    const range = rangeFor(dateKind, from, to)
    const searching = search.trim() !== ''
    // Without a search or a date choice the newest 100 bills are shown. Otherwise all of them are looked through.
    const everything = searching || range !== null
    const sales = useLiveQuery(() => listSales({ limit: everything ? 100000 : 100 }), [everything])

    const shown = (sales ?? [])
        .filter((sale) => filter === 'all' || (sale.paymentStatus === 'pending' && sale.status !== 'cancelled'))
        .filter((sale) => inRange(sale, range))
        .filter((sale) => saleMatches(sale, search))
    const summary = summarizeSales(shown)
    const groups = groupByDay(shown)

    const segment = (value, label) => (
        <button
            type="button"
            aria-pressed={filter === value}
            onClick={() => setParams(value === 'pending' ? { filter: 'pending' } : {})}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${filter === value
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
                }`}
        >
            {label}
        </button>
    )

    return (
        <div className="space-y-5">
            <h2 className="text-2xl font-bold text-slate-900">Sales</h2>

            <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div>
                    <label htmlFor="sales-search" className="sr-only">
                        Search bills
                    </label>
                    <input
                        id="sales-search"
                        className={`${inputClass} py-3!`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by customer name, mobile number or invoice number"
                    />
                </div>

                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label htmlFor="sales-date" className="text-sm font-medium text-slate-700">
                            Show bills from
                        </label>
                        <select
                            id="sales-date"
                            className={`${inputClass} mt-1`}
                            value={dateKind}
                            onChange={(e) => setDateKind(e.target.value)}
                        >
                            {DATE_CHOICES.map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {dateKind === 'custom' && (
                        <>
                            <div>
                                <label htmlFor="sales-from" className="text-sm font-medium text-slate-700">
                                    From date
                                </label>
                                <input
                                    id="sales-from"
                                    type="date"
                                    className={`${inputClass} mt-1`}
                                    value={from}
                                    max={to || undefined}
                                    onChange={(e) => setFrom(e.target.value)}
                                />
                            </div>
                            <div>
                                <label htmlFor="sales-to" className="text-sm font-medium text-slate-700">
                                    To date
                                </label>
                                <input
                                    id="sales-to"
                                    type="date"
                                    className={`${inputClass} mt-1`}
                                    value={to}
                                    min={from || undefined}
                                    onChange={(e) => setTo(e.target.value)}
                                />
                            </div>
                        </>
                    )}
                    <div className="inline-flex rounded-lg bg-slate-100 p-1">
                        {segment('all', 'All')}
                        {segment('pending', 'Payment pending')}
                    </div>
                </div>
            </div>

            {sales && shown.length > 0 && (
                <p
                    data-testid="sales-summary"
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl bg-blue-600 px-5 py-4 text-white shadow-sm"
                >
                    <span className="flex flex-wrap items-center gap-3">
                        <span className="text-base font-semibold leading-none">
                            {summary.count} {summary.count === 1 ? 'bill' : 'bills'}
                        </span>
                        {summary.pendingPaise > 0 && (
                            <span className="rounded-full bg-amber-300 px-3 py-1 text-sm font-semibold leading-none text-amber-950">
                                Payment pending {formatINR(summary.pendingPaise)}
                            </span>
                        )}
                    </span>
                    <span className="ml-auto flex items-baseline gap-2 text-right">
                        <span className="sr-only"> · </span>
                        <span className="text-sm leading-none text-blue-100">Total{' '}</span>
                        <span className="text-3xl font-bold leading-none tabular-nums">
                            {formatINR(summary.totalPaise)}
                        </span>
                    </span>
                </p>
            )}

            {sales === undefined && <p className="text-slate-500">Loading...</p>}
            {sales && shown.length === 0 && (
                <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
                    <p className="text-lg font-semibold text-slate-700">
                        {searching || range
                            ? 'No bills match your search or dates.'
                            : filter === 'pending'
                                ? 'No bills are waiting for payment.'
                                : 'No sales yet.'}
                    </p>
                    {(searching || range) && (
                        <p className="mt-1 text-sm text-slate-500">Try other words, or choose "All dates".</p>
                    )}
                </div>
            )}

            {groups.map((group) => (
                <section key={group.label} className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.label}</h3>
                    <ul className="space-y-2">
                        {group.sales.map((sale) => {
                            const cancelled = sale.status === 'cancelled'
                            const pending = sale.paymentStatus === 'pending'
                            const bar = cancelled ? 'bg-red-400' : pending ? 'bg-amber-400' : 'bg-emerald-500'
                            return (
                                <li key={sale.id}>
                                    <Link
                                        to={`/sales/${sale.id}`}
                                        className="flex overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:shadow-md"
                                    >
                                        <span aria-hidden="true" className={`w-1.5 shrink-0 ${bar}`} />
                                        <div className="min-w-0 flex-1 space-y-1 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-base font-bold text-slate-900">
                                                    {sale.invoiceNumber}
                                                    {cancelled && (
                                                        <span className="ml-2 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                                                            Cancelled
                                                        </span>
                                                    )}
                                                    {pending && !cancelled && (
                                                        <span
                                                            data-testid="pending-badge"
                                                            className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
                                                        >
                                                            Payment pending
                                                        </span>
                                                    )}
                                                </p>
                                                <p
                                                    className={`shrink-0 text-lg font-bold ${cancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                                                >
                                                    {formatINR(sale.totalPaise)}
                                                </p>
                                            </div>
                                            {(sale.customerName || sale.customerPhone) && (
                                                <p className="truncate text-sm font-medium text-slate-700">
                                                    {[sale.customerName, sale.customerPhone].filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                            <p className="text-sm text-slate-500">
                                                {formatDateTime(sale.createdAt)} · {sale.itemCount} items
                                                {!pending && ` · ${paymentText(sale)}`}
                                                {!pending && !cancelled && sale.shortPaise > 0 && (
                                                    <span className="font-medium text-amber-700">
                                                        {' '}
                                                        · Short {formatINR(sale.shortPaise)}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                </section>
            ))}
        </div>
    )
}