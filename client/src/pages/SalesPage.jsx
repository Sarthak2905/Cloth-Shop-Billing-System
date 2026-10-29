import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSales } from '../db/saleRepo'
import { PAYMENT_LABEL, formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'

export default function SalesPage() {
    const sales = useLiveQuery(() => listSales({ limit: 100 }), [])

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Sales</h2>

            {sales === undefined && <p className="text-slate-500">Loading...</p>}
            {sales && sales.length === 0 && (
                <p className="rounded-xl bg-white p-6 text-center text-slate-500 shadow-sm">
                    No sales yet.
                </p>
            )}

            <ul className="space-y-2">
                {sales?.map((sale) => (
                    <li key={sale.id}>
                        <Link
                            to={`/sales/${sale.id}`}
                            className="block rounded-xl bg-white p-4 shadow-sm hover:shadow"
                        >
                            <div className="flex justify-between gap-2">
                                <p className="font-semibold">{sale.invoiceNumber}</p>
                                <p className="font-semibold">{formatINR(sale.totalPaise)}</p>
                            </div>
                            <p className="text-sm text-slate-500">
                                {formatDateTime(sale.createdAt)} · {sale.itemCount} items ·{' '}
                                {PAYMENT_LABEL[sale.payment.method]}
                            </p>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}