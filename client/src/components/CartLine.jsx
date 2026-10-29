import { useState } from 'react'
import DiscountEditor from './DiscountEditor'
import { dangerButton, secondaryButton } from './styles'
import { formatINR } from '../lib/money'

export default function CartLine({ line, totals, onQuantity, onRemove, onDiscount }) {
    const [showDiscount, setShowDiscount] = useState(false)
    const lineAmount = totals.grossPaise - totals.lineDiscountPaise

    return (
        <li data-testid="cart-line" className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex justify-between gap-2">
                <div>
                    <p className="font-semibold">{line.productName}</p>
                    <p className="text-sm text-slate-500">
                        Size {line.size} · {formatINR(line.unitPricePaise)} each
                    </p>
                    <p className="text-xs text-slate-400">
                        {line.barcode} · Available: {line.availableStock}
                    </p>
                </div>
                <div className="text-right">
                    <p className="font-semibold">{formatINR(lineAmount)}</p>
                    {totals.lineDiscountPaise > 0 && (
                        <p className="text-xs text-green-700">
                            Discount -{formatINR(totals.lineDiscountPaise)}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    aria-label="Decrease quantity"
                    className={secondaryButton}
                    disabled={line.quantity <= 1}
                    onClick={() => onQuantity(line.quantity - 1)}
                >
                    -
                </button>
                <span data-testid="qty" className="min-w-8 text-center font-semibold">
                    {line.quantity}
                </span>
                <button
                    type="button"
                    aria-label="Increase quantity"
                    className={secondaryButton}
                    onClick={() => onQuantity(line.quantity + 1)}
                >
                    +
                </button>
                <button type="button" className={secondaryButton} onClick={() => setShowDiscount((s) => !s)}>
                    Discount
                </button>
                <button type="button" className={dangerButton} onClick={onRemove}>
                    Remove
                </button>
            </div>

            {showDiscount && (
                <DiscountEditor label="Item discount" discount={line.discount} onApply={onDiscount} />
            )}
        </li>
    )
}