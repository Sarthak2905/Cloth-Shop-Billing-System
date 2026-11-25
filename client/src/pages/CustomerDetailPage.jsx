import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getCustomerHistory } from '../db/customerRepo'
import { formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'
import { formatQuantity } from '../lib/quantity'
import Avatar from '../components/Avatar'
import StatTile from '../components/StatTile'

export default function CustomerDetailPage() {
    const { key } = useParams()
    // undefined = loading, null = not found
    const data = useLiveQuery(async () => (await getCustomerHistory(key)) ?? null, [key])

    if (data === undefined) return <p className="text-slate-500">Loading...</p>
    if (data === null) {
        return (
            <div className="space-y-2">
                <p>Customer not found.</p>
                <Link to="/customers" className="text-blue-600">
                    ← Back to customers
                </Link>
            </div>
        )
    }

    const { customer, sales, itemsBySale, bought } = data
    const itemsOf = (id) => itemsBySale.find((x) => x.id === id)?.items ?? []

    return (
        <div className="space-y-5">
            <Link to="/customers" className="inline-block text-sm font-medium text-blue-600">
                ← Back to customers
            </Link>

            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <Avatar name={customer.name} size="lg" />
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-2xl font-bold text-slate-900">{customer.name || 'No name'}</h2>
                    <p className="text-slate-600">{customer.phone || 'No number'}</p>
                </div>
               
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Bills" value={customer.visits} />
                <StatTile label="Total bought" value={formatINR(customer.totalPaise)} />
                <StatTile
                    label="Payment pending"
                    value={formatINR(customer.pendingPaise)}
                    tone={customer.pendingPaise > 0 ? 'warn' : 'default'}
                />
                <StatTile label="Last visit" value={formatDateTime(customer.lastAt)} />
            </dl>

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-3 text-lg font-bold text-slate-900">What they bought</h3>
                {bought.length === 0 ? (
                    <p className="text-sm text-slate-500">Nothing yet.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {bought.map((row) => (
                            <li key={row.variantId} className="flex items-center justify-between gap-3 py-3">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-900">
                                        {row.productName}
                                        {row.size ? ` · Size ${row.size}` : ''}
                                    </p>
                                    <p className="text-xs text-slate-500">Last bought {formatDateTime(row.lastAt)}</p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="font-bold text-slate-900">{formatQuantity(row.quantity, row.unit)}</p>
                                    <p className="text-xs text-slate-500">
                                        {row.times} {row.times === 1 ? 'time' : 'times'}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900">Bills</h3>
                <ul className="space-y-2">
                    {sales.map((sale) => {
                        const cancelled = sale.status === 'cancelled'
                        const pending = !cancelled && sale.paymentStatus === 'pending'
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
                                            <p className="font-bold text-slate-900">
                                                {sale.invoiceNumber}
                                                {cancelled && (
                                                    <span className="ml-2 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                                                        Cancelled
                                                    </span>
                                                )}
                                                {pending && (
                                                    <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
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
                                        <p className="text-sm text-slate-500">{formatDateTime(sale.createdAt)}</p>
                                        <p className="text-sm text-slate-600">
                                            {itemsOf(sale.id)
                                                .map(
                                                    (i) =>
                                                        `${i.productName}${i.size ? ` (${i.size})` : ''} × ${formatQuantity(i.quantity, i.unit)}`,
                                                )
                                                .join(', ')}
                                        </p>
                                    </div>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            </section>
        </div>
    )
}