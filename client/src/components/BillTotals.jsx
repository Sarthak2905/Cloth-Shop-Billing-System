import { formatINR } from '../lib/money'

function Row({ label, value, strong }) {
    return (
        <div className={`flex justify-between ${strong ? 'text-lg font-bold' : 'text-sm text-slate-700'}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    )
}

export default function BillTotals({ totals }) {
    return (
        <div className="space-y-1 rounded-xl bg-white p-4 shadow-sm">
            <dl className="space-y-1">
                <Row label={`Subtotal (${totals.itemCount} items)`} value={formatINR(totals.subtotalPaise)} />
                {totals.discountPaise > 0 && (
                    <Row label="Discount" value={`-${formatINR(totals.discountPaise)}`} />
                )}
                {totals.taxAddedPaise > 0 && (
                    <Row label="Tax added" value={formatINR(totals.taxAddedPaise)} />
                )}
                {totals.roundOffPaise !== 0 && (
                    <Row
                        label="Round off"
                        value={`${totals.roundOffPaise < 0 ? '-' : '+'}${formatINR(Math.abs(totals.roundOffPaise))}`}
                    />
                )}
                <div className="border-t pt-2">
                    <div className="flex justify-between text-lg font-bold">
                        <dt>Total</dt>
                        <dd data-testid="bill-total">{formatINR(totals.totalPaise)}</dd>
                    </div>
                </div>
            </dl>
            {totals.taxIncludedPaise > 0 && (
                <p className="text-xs text-slate-500">
                    Includes tax of {formatINR(totals.taxIncludedPaise)}
                </p>
            )}
        </div>
    )
}