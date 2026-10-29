import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSale } from '../db/saleRepo'
import BillTotals from '../components/BillTotals'
import { PAYMENT_LABEL, formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'

export default function SaleDetailPage() {
    const { id } = useParams()
    // undefined = loading, null = not found
    const data = useLiveQuery(async () => (await getSale(id)) ?? null, [id])

    if (data === undefined) return <p className="text-slate-500">Loading...</p>
    if (data === null) {
        return (
            <div className="space-y-2">
                <p>Sale not found.</p>
                <Link to="/sales" className="text-blue-600">
                    ← Back to sales
                </Link>
            </div>
        )
    }

    const { sale, items } = data

    return (
        <div className="space-y-4">
            <Link to="/sales" className="text-sm text-blue-600">
                ← Back to sales
            </Link>

            <div className="rounded-xl bg-white p-4 shadow-sm">
                <h2 className="text-xl font-bold">{sale.invoiceNumber}</h2>
                <p className="text-sm text-slate-500">{formatDateTime(sale.createdAt)}</p>
                <p className="text-sm text-slate-500">{sale.shop.name}</p>
            </div>

            <ul className="space-y-2">
                {items.map((item) => (
                    <li key={item.id} className="rounded-xl bg-white p-4 shadow-sm">
                        <div className="flex justify-between gap-2">
                            <div>
                                <p className="font-semibold">{item.productName}</p>
                                <p className="text-sm text-slate-500">
                                    Size {item.size} · {item.quantity} x {formatINR(item.unitPricePaise)}
                                </p>
                            </div>
                            <p className="font-semibold">
                                {formatINR(item.grossPaise - item.lineDiscountPaise)}
                            </p>
                        </div>
                        {item.lineDiscountPaise > 0 && (
                            <p className="text-xs text-green-700">
                                Discount -{formatINR(item.lineDiscountPaise)}
                            </p>
                        )}
                    </li>
                ))}
            </ul>

            <BillTotals totals={sale} />

            <div className="rounded-xl bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold">Payment</p>
                <p>{PAYMENT_LABEL[sale.payment.method]}</p>
                {sale.payment.method === 'cash' && (
                    <>
                        <p>Received: {formatINR(sale.payment.amountTenderedPaise)}</p>
                        <p>Change: {formatINR(sale.payment.changePaise)}</p>
                    </>
                )}
                {sale.payment.reference && <p>Reference: {sale.payment.reference}</p>}
            </div>
        </div>
    )
}