import { useState } from 'react'
import DiscountEditor from './DiscountEditor'
import { formatINR } from '../lib/money'
import { sizeText } from '../printing/receiptItems'

const chip =
    'inline-block rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const chipDanger =
    'inline-block rounded-lg border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-50'

// A compact row for an item sold by the piece. Fabric sold by the meter has its own row
// (CartLine) with the length box.
export default function BillLine({
    line,
    totals,
    highlight = false,
    onQuantity,
    onRemove,
    onDiscount,
    onToggleExcluded,
}) {
    const [showDiscount, setShowDiscount] = useState(false)
    const amount = totals.grossPaise - totals.lineDiscountPaise
    const neverDiscounted = line.discountAllowed === false
    const excluded = line.discountExcluded === true

    return (
        <li
            data-testid="cart-line"
            className={`rounded-xl bg-white p-3 shadow-sm ${highlight ? 'border-2 border-blue-500' : 'border border-slate-200'
                }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold">
                        {line.productName}
                        {sizeText(line.size)}
                    </p>
                    <p className="text-xs text-slate-500">
                        {formatINR(line.unitPricePaise)} each · {line.availableStock} in stock
                        {neverDiscounted && <span className="text-amber-700"> · never discounted</span>}
                        {excluded && <span className="text-amber-700"> · no discount on this bill</span>}
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-lg font-bold">{formatINR(amount)}</p>
                    {totals.lineDiscountPaise > 0 && (
                        <p className="text-xs text-green-700">Discount -{formatINR(totals.lineDiscountPaise)}</p>
                    )}
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    aria-label="Decrease quantity"
                    className={chip}
                    disabled={line.quantity <= 1}
                    onClick={() => onQuantity(line.quantity - 1)}
                >
                    -
                </button>
                <span data-testid="qty" className="min-w-8 text-center text-lg font-bold">
                    {line.quantity}
                </span>
                <button
                    type="button"
                    aria-label="Increase quantity"
                    className={chip}
                    onClick={() => onQuantity(line.quantity + 1)}
                >
                    +
                </button>
                {!neverDiscounted && (
                    <>
                        <button type="button" className={chip} onClick={() => setShowDiscount((s) => !s)}>
                            Discount
                        </button>
                        <button
                            type="button"
                            aria-pressed={excluded}
                            className={chip}
                            onClick={() => onToggleExcluded(!excluded)}
                        >
                            {excluded ? 'Allow discount' : 'No discount'}
                        </button>
                    </>
                )}
                <button type="button" className={`${chipDanger} ml-auto`} onClick={onRemove}>
                    Remove
                </button>
            </div>

            {showDiscount && (
                <DiscountEditor label="Item discount" discount={line.discount} onApply={onDiscount} />
            )}
        </li>
    )
}