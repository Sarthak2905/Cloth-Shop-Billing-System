import { isStorageFull } from '../lib/storageErrors'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSellableVariants } from '../db/catalogRepo'
import { getSettings } from '../db/settingsRepo'
import { createSale } from '../db/saleRepo'
import { lookupBarcode } from '../scanner/scanService'
import { useBarcodeScanner } from '../scanner/useBarcodeScanner'
import { simulateKeyboardScan } from '../scanner/simulateScan'
import {
    addItem,
    createCart,
    lineFromVariant,
    removeItem,
    setBillDiscount,
    setLineDiscount,
    setQuantity,
} from '../billing/cart'
import { calculateTotals } from '../billing/calc'
import CameraScanner from '../components/CameraScanner'
import CartLine from '../components/CartLine'
import BillTotals from '../components/BillTotals'
import DiscountEditor from '../components/DiscountEditor'
import FormField from '../components/FormField'
import PaymentPanel from '../components/PaymentPanel'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { AppError } from '../lib/errors'
import { PAYMENT_LABEL } from '../lib/format'
import { newId } from '../lib/id'
import { formatINR } from '../lib/money'

const QUICK_PERCENT = 10

export default function BillingPage() {
    const [cart, setCart] = useState(createCart)
    const cartRef = useRef(cart) // always the newest cart, even during fast scans
    const saleIdRef = useRef(null) // idempotency key for the sale being saved
    const [notice, setNotice] = useState(null)
    const [completed, setCompleted] = useState(null)
    const [code, setCode] = useState('')
    const [search, setSearch] = useState('')
    const [cameraOn, setCameraOn] = useState(false)
    const inputRef = useRef(null)

    const settings = useLiveQuery(() => getSettings(), [])
    const items = useLiveQuery(() => listSellableVariants(), [])
    const allowNegativeStock = settings?.allowNegativeStock ?? false
    const roundToRupee = settings?.roundToRupee ?? true

    const totals = useMemo(
        () => calculateTotals(cart, { roundToRupee }),
        [cart, roundToRupee],
    )
    const totalsByVariant = new Map(totals.lines.map((l) => [l.variantId, l]))

    // Runs a cart change. Returns the error message, or null when it worked.
    function applyChange(change, successText) {
        const { cart: next, error } = change(cartRef.current)
        if (error) {
            setNotice({ type: 'error', text: error })
            return error
        }
        cartRef.current = next
        saleIdRef.current = null // the bill changed, so it needs a new sale id
        setCart(next)
        setCompleted(null)
        setNotice(successText ? { type: 'ok', text: successText } : null)
        return null
    }

    function addToBill(variant, product) {
        applyChange(
            (c) => addItem(c, lineFromVariant(variant, product), { allowNegativeStock }),
            `Added ${product.name} (size ${variant.size})`,
        )
    }

    async function handleCode(raw) {
        const result = await lookupBarcode(raw)
        if (result.status === 'found') addToBill(result.variant, result.product)
        else setNotice({ type: 'error', text: result.message })
    }

    // Keyboard-style hardware scanners (when no text box has focus).
    useBarcodeScanner({ onScan: handleCode })

    function handleSubmit(e) {
        e.preventDefault()
        handleCode(code)
        setCode('')
        inputRef.current?.focus()
    }

    function handleSimulate() {
        if (!items?.length) return
        const pick = items[Math.floor(Math.random() * items.length)]
        simulateKeyboardScan(pick.variant.barcode)
    }

    function handleClearBill() {
        if (cart.lines.length > 0 && !window.confirm('Clear the whole bill?')) return
        cartRef.current = createCart()
        saleIdRef.current = null
        setCart(cartRef.current)
        setNotice(null)
    }

    // Saves the sale. Returns an error message, or null when it worked.
    async function completeSale(payment) {
        saleIdRef.current ??= newId()
        try {
            const { sale } = await createSale({
                id: saleIdRef.current,
                cart: cartRef.current,
                payment,
            })
            saleIdRef.current = null
            cartRef.current = createCart()
            setCart(cartRef.current)
            setCompleted(sale)
            setNotice(null)
            return null
        } catch (err) {
            if (err instanceof AppError) return err.message
            console.error(err)
            if (isStorageFull(err)) {
                return 'This device is out of storage space. Free up space and try again. Nothing was saved.'
            }
            return 'Could not save the sale. Nothing was charged. Please try again.'
        }
    }

    const query = search.trim().toLowerCase()
    const results = query
        ? (items ?? [])
            .filter(
                ({ variant, product }) =>
                    product.name.toLowerCase().includes(query) ||
                    variant.sku.toLowerCase().includes(query) ||
                    variant.barcode.toLowerCase().includes(query),
            )
            .slice(0, 8)
        : []

    const quickOn =
        cart.billDiscount?.type === 'percent' && cart.billDiscount.value === QUICK_PERCENT

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Billing</h2>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-3">
                    <FormField label="Barcode" htmlFor="bill-barcode">
                        <input
                            id="bill-barcode"
                            ref={inputRef}
                            autoFocus
                            autoComplete="off"
                            className={inputClass}
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="Scan or type a barcode, then press Enter"
                        />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                        <button type="submit" className={primaryButton}>
                            Add to bill
                        </button>
                        <button
                            type="button"
                            className={secondaryButton}
                            onClick={() => setCameraOn((on) => !on)}
                        >
                            {cameraOn ? 'Stop camera' : 'Start camera'}
                        </button>
                        <button type="button" className={secondaryButton} onClick={handleSimulate}>
                            Simulate scan
                        </button>
                    </div>
                </form>
                <CameraScanner active={cameraOn} onScan={handleCode} />
            </div>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <FormField label="Search items" htmlFor="bill-search">
                    <input
                        id="bill-search"
                        className={inputClass}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Name, SKU or barcode"
                    />
                </FormField>
                {query && results.length === 0 && (
                    <p className="text-sm text-slate-500">No matching items.</p>
                )}
                <ul className="space-y-2">
                    {results.map(({ variant, product }) => (
                        <li key={variant.id}>
                            <button
                                type="button"
                                aria-label={`Add ${product.name} size ${variant.size}`}
                                className="flex w-full justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
                                onClick={() => addToBill(variant, product)}
                            >
                                <span>
                                    <span className="font-medium">{product.name}</span>
                                    <span className="block text-sm text-slate-500">
                                        Size {variant.size} · Stock {variant.currentStock}
                                    </span>
                                </span>
                                <span className="font-medium">{formatINR(variant.sellingPricePaise)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {notice && (
                <p
                    role={notice.type === 'error' ? 'alert' : 'status'}
                    className={`rounded-lg p-3 text-sm ${notice.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}
                >
                    {notice.text}
                </p>
            )}

            {completed && (
                <div
                    data-testid="sale-complete"
                    role="status"
                    className="space-y-2 rounded-xl border-l-4 border-green-500 bg-white p-4 shadow-sm"
                >
                    <p className="font-semibold text-green-700">Sale saved</p>
                    <p className="text-lg font-bold">Invoice {completed.invoiceNumber}</p>
                    <p className="text-sm text-slate-600">
                        Total {formatINR(completed.totalPaise)} · {PAYMENT_LABEL[completed.payment.method]}
                    </p>
                    {completed.payment.method === 'cash' && completed.payment.changePaise > 0 && (
                        <p className="text-lg font-semibold">
                            Change due: {formatINR(completed.payment.changePaise)}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <Link to={`/sales/${completed.id}`} className={secondaryButton}>
                            View sale
                        </Link>
                        <button type="button" className={primaryButton} onClick={() => setCompleted(null)}>
                            New bill
                        </button>
                    </div>
                </div>
            )}

            {cart.lines.length === 0 ? (
                <p className="rounded-xl bg-white p-6 text-center text-slate-500 shadow-sm">
                    The bill is empty. Scan a barcode or search for an item.
                </p>
            ) : (
                <>
                    <ul className="space-y-2">
                        {cart.lines.map((line) => (
                            <CartLine
                                key={line.variantId}
                                line={line}
                                totals={totalsByVariant.get(line.variantId)}
                                onQuantity={(q) =>
                                    applyChange((c) => setQuantity(c, line.variantId, q, { allowNegativeStock }))
                                }
                                onRemove={() => applyChange((c) => removeItem(c, line.variantId))}
                                onDiscount={(d) => applyChange((c) => setLineDiscount(c, line.variantId, d))}
                            />
                        ))}
                    </ul>

                    <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                        <p className="font-semibold">Bill discount</p>
                        <button
                            type="button"
                            aria-pressed={quickOn}
                            className={quickOn ? primaryButton : secondaryButton}
                            onClick={() =>
                                applyChange((c) =>
                                    setBillDiscount(c, quickOn ? null : { type: 'percent', value: QUICK_PERCENT }),
                                )
                            }
                        >
                            {QUICK_PERCENT}% off
                        </button>
                        <DiscountEditor
                            key={JSON.stringify(cart.billDiscount)}
                            label="Bill discount"
                            discount={cart.billDiscount}
                            onApply={(d) => applyChange((c) => setBillDiscount(c, d))}
                        />
                    </div>

                    <BillTotals totals={totals} />

                    <PaymentPanel totalPaise={totals.totalPaise} onComplete={completeSale} />

                    <button type="button" className={secondaryButton} onClick={handleClearBill}>
                        Clear bill
                    </button>
                </>
            )}
        </div>
    )
}