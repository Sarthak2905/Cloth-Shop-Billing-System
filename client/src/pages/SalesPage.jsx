import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSales } from '../db/saleRepo'
import { formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'
import { paymentText } from '../lib/payments'

export default function SalesPage() {
    const [params, setParams] = useSearchParams()
    const filter = params.get('filter') === 'pending' ? 'pending' : 'all'
    const sales = useLiveQuery(() => listSales({ limit: 100 }), [])

    const shown = (sales ?? []).filter(
        (sale) => filter === 'all' || (sale.paymentStatus === 'pending' && sale.status !== 'cancelled'),
    )

    const chip = (value, label) => (
        <button
            type="button"
            aria-pressed={filter === value}
            onClick={() => setParams(value === 'pending' ? { filter: 'pending' } : {})}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${filter === value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
        >
            {label}
        </button>
    )

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Sales</h2>

            <div className="flex gap-2">
                {chip('all', 'All')}
                {chip('pending', 'Payment pending')}
            </div>

            {sales === undefined && <p className="text-slate-500">Loading...</p>}
            {sales && shown.length === 0 && (
                <p className="rounded-xl bg-white p-6 text-center text-slate-500 shadow-sm">
                    {filter === 'pending' ? 'No bills are waiting for payment.' : 'No sales yet.'}
                </p>
            )}

            <ul className="space-y-2">
                {shown.map((sale) => {
                    const cancelled = sale.status === 'cancelled'
                    const pending = sale.paymentStatus === 'pending'
                    return (
                        <li key={sale.id}>
                            <Link
                                to={`/sales/${sale.id}`}
                                className="block rounded-xl bg-white p-4 shadow-sm hover:shadow"
                            >
                                <div className="flex justify-between gap-2">
                                    <p className="font-semibold">
                                        {sale.invoiceNumber}
                                        {cancelled && (
                                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                                Cancelled
                                            </span>
                                        )}
                                        {pending && !cancelled && (
                                            <span
                                                data-testid="pending-badge"
                                                className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                                            >
                                                Payment pending
                                            </span>
                                        )}
                                    </p>
                                    <p className={`font-semibold ${cancelled ? 'text-slate-400 line-through' : ''}`}>
                                        {formatINR(sale.totalPaise)}
                                    </p>
                                </div>
                                <p className="text-sm text-slate-500">
                                    {formatDateTime(sale.createdAt)} · {sale.itemCount} items
                                    {!pending && ` · ${paymentText(sale)}`}
                                    {!pending && !cancelled && sale.shortPaise > 0 && (
                                        <span className="text-amber-700"> · Short {formatINR(sale.shortPaise)}</span>
                                    )}
                                </p>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}