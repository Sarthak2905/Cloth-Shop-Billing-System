import { isStorageFull } from '../lib/storageErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSellableVariants } from '../db/catalogRepo'
import { getSettings } from '../db/settingsRepo'
import { createSale } from '../db/saleRepo'
import { buildCorrectionCart, correctSale } from '../db/correctionRepo'
import { countPendingPayments } from '../db/paymentRepo'
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
    setLineDiscountExcluded,
    setQuantity,
} from '../billing/cart'
import { calculateTotals } from '../billing/calc'
import { createPrinter } from '../printing/printerFactory'
import { printReceipt } from '../printing/printService'
import BillLine from '../components/BillLine'
import CameraScanner from '../components/CameraScanner'
import CartLine from '../components/CartLine'
import CorrectionPayment from '../components/CorrectionPayment'
import DiscountEditor from '../components/DiscountEditor'
import PayBox from '../components/PayBox'
import PaymentRecordPanel from '../components/PaymentRecordPanel'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { AppError } from '../lib/errors'
import { newId } from '../lib/id'
import { formatINR } from '../lib/money'
import { EMPTY_PAYMENT_FORM, paymentsFromForm } from '../lib/paymentForm'
import { paymentInfo, summarizePayments } from '../lib/payments'
import { formatQuantity } from '../lib/quantity'

const QUICK_PERCENTS = [10, 20]
const CORRECTION_WINDOW_MS = 15 * 60 * 1000 // the owner PIN approval is valid for 15 minutes

const PRINT_DONE = {
    simulated: 'Simulated print only: nothing came out of a printer. Choose "Windows printer" in Settings.',
    handed_off: 'Sent to the printer.',
    device_confirmed: 'Printed.',
}

function TotalsCard({ totals }) {
    const discountable = totals.eligibleBasePaise
    const partial =
        totals.billDiscountPaise > 0 &&
        discountable !== undefined &&
        discountable < totals.subtotalPaise - totals.itemDiscountPaise

    return (
        <div className="rounded-xl bg-white p-3 shadow-sm">
            <dl className="space-y-0.5 text-sm text-slate-700">
                <div className="flex justify-between">
                    <dt>Subtotal ({totals.itemCount} items)</dt>
                    <dd>{formatINR(totals.subtotalPaise)}</dd>
                </div>
                {totals.discountPaise > 0 && (
                    <div className="flex justify-between">
                        <dt>Discount</dt>
                        <dd>-{formatINR(totals.discountPaise)}</dd>
                    </div>
                )}
                {totals.taxAddedPaise > 0 && (
                    <div className="flex justify-between">
                        <dt>GST added</dt>
                        <dd>{formatINR(totals.taxAddedPaise)}</dd>
                    </div>
                )}
                {totals.taxIncludedPaise > 0 && (
                    <div className="flex justify-between text-slate-500">
                        <dt>GST included</dt>
                        <dd>{formatINR(totals.taxIncludedPaise)}</dd>
                    </div>
                )}
                {totals.roundOffPaise !== 0 && (
                    <div className="flex justify-between">
                        <dt>Round off</dt>
                        <dd>
                            {totals.roundOffPaise < 0 ? '-' : '+'}
                            {formatINR(Math.abs(totals.roundOffPaise))}
                        </dd>
                    </div>
                )}
            </dl>
            <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="text-base font-bold">Total</span>
                <span data-testid="bill-total" className="text-3xl font-bold">
                    {formatINR(totals.totalPaise)}
                </span>
            </div>
            {partial && (
                <p className="mt-1 text-xs text-slate-500">
                    The bill discount applies to {formatINR(discountable)} of items that allow discounts.
                </p>
            )}
        </div>
    )
}

export default function BillingPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const authSaleId = location.state?.correction?.saleId
    const authAt = location.state?.correction?.authorizedAt
    const authReason = location.state?.correction?.reason

    const [cart, setCart] = useState(createCart)
    const cartRef = useRef(cart) // always the newest cart, even during fast scans
    const saleIdRef = useRef(null) // idempotency key for the sale being saved
    const [notice, setNotice] = useState(null)
    const [completed, setCompleted] = useState(null)
    const [printMsg, setPrintMsg] = useState(null)
    const [showRecord, setShowRecord] = useState(false)
    const [correction, setCorrection] = useState(null) // { sale, reason } while correcting a bill
    const [focusRequest, setFocusRequest] = useState(null) // jumps to a fabric's length box
    const [flashId, setFlashId] = useState(null) // the item that was just added
    const [code, setCode] = useState('')
    const [search, setSearch] = useState('')
    const [cameraOn, setCameraOn] = useState(false)
    const [payForm, setPayForm] = useState(EMPTY_PAYMENT_FORM)
    const [payError, setPayError] = useState('')
    const [saving, setSaving] = useState(false)
    const inputRef = useRef(null)
    const listRef = useRef(null)
    const saveRef = useRef(null)

    const settings = useLiveQuery(() => getSettings(), [])
    const items = useLiveQuery(() => listSellableVariants(), [])
    const pendingCount = useLiveQuery(() => countPendingPayments(), []) ?? 0
    const allowNegativeStock = settings?.allowNegativeStock ?? false
    // While correcting, the old quantities are put back when saving, so the screen does
    // not block here. The real stock check happens when the corrected bill is saved.
    const stockRule = correction ? true : allowNegativeStock
    const roundToRupee = settings?.roundToRupee ?? true

    const totals = useMemo(
        () => calculateTotals(cart, { roundToRupee }),
        [cart, roundToRupee],
    )
    const totalsByVariant = new Map(totals.lines.map((l) => [l.variantId, l]))
    // The newest item is shown first.
    const ordered = [...cart.lines].reverse()

    // Opens the old bill for correction when the owner PIN was accepted on the sale page.
    useEffect(() => {
        if (!authSaleId) return undefined
        if (!Number.isFinite(authAt) || Date.now() - authAt > CORRECTION_WINDOW_MS) {
            setNotice({
                type: 'error',
                text: 'The owner PIN approval has expired. Open the bill and tap "Correct this bill" again.',
            })
            return undefined
        }
        let active = true
        buildCorrectionCart(authSaleId)
            .then(({ sale, cart: start }) => {
                if (!active) return
                cartRef.current = start
                saleIdRef.current = null
                setCart(start)
                setCompleted(null)
                setNotice(null)
                setCorrection({ sale, reason: authReason })
            })
            .catch((err) => {
                if (!active) return
                if (!(err instanceof AppError)) console.error(err)
                setNotice({
                    type: 'error',
                    text: err instanceof AppError ? err.message : 'Could not open this bill for correction.',
                })
            })
        return () => {
            active = false
        }
    }, [authSaleId, authAt, authReason])

    // F2 = the barcode box, F9 = save & print.
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'F2') {
                e.preventDefault()
                inputRef.current?.focus({ preventScroll: true })
                inputRef.current?.select()
            } else if (e.key === 'F9') {
                e.preventDefault()
                saveRef.current?.(true)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

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
        const meter = variant.unit === 'meter'
        const error = applyChange(
            (c) => addItem(c, lineFromVariant(variant, product), { allowNegativeStock: stockRule }),
            meter
                ? `Added ${product.name} (${variant.size}), 1.00 m. Type the length or tap a quick length.`
                : `Added ${product.name} (size ${variant.size})`,
        )
        if (error) return
        setFlashId(variant.id)
        if (listRef.current) listRef.current.scrollTop = 0
        // Fabric: the cursor jumps into its length box.
        if (meter) setFocusRequest({ variantId: variant.id, n: Date.now() })
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
        inputRef.current?.focus({ preventScroll: true })
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
        setFlashId(null)
        setNotice(null)
    }

    function handleCancelCorrection() {
        const oldId = correction?.sale.id
        cartRef.current = createCart()
        saleIdRef.current = null
        setCart(cartRef.current)
        setCorrection(null)
        setNotice(null)
        navigate(oldId ? `/sales/${oldId}` : '/billing', { replace: true, state: null })
    }

    function errorText(err) {
        if (err instanceof AppError) return err.message
        console.error(err)
        if (isStorageFull(err)) {
            return 'This device is out of storage space. Free up space and try again. Nothing was saved.'
        }
        return null
    }

    // Prints the customer's bill on the printer chosen in Settings. The sale is already
    // saved, so a printing problem never loses it.
    async function printSale(saleId) {
        try {
            const current = await getSettings()
            const job = await printReceipt({ saleId, printer: createPrinter(current.receiptPrinter) })
            setPrintMsg(
                job.status === 'completed'
                    ? { type: 'ok', text: PRINT_DONE[job.confirmation] ?? 'Done.' }
                    : { type: 'error', text: job.error },
            )
        } catch (err) {
            setPrintMsg({ type: 'error', text: err.message })
        }
    }

    function afterSave(sale) {
        saleIdRef.current = null
        cartRef.current = createCart()
        setCart(cartRef.current)
        setCompleted(sale)
        setFlashId(null)
        setNotice(null)
        setPrintMsg(null)
        setShowRecord(false)
        setPayForm(EMPTY_PAYMENT_FORM)
        inputRef.current?.focus({ preventScroll: true })
    }

    // Saves the bill with whatever payment was typed (nothing typed = payment pending),
    // then prints it.
    async function handleSave(print = true) {
        if (saving || cartRef.current.lines.length === 0) return
        const { payments, error } = paymentsFromForm(payForm)
        if (error) {
            setPayError(error)
            return
        }
        const summary = summarizePayments(totals.totalPaise, payments)
        if (summary.error) {
            setPayError(summary.error)
            return
        }

        setPayError('')
        setSaving(true)
        saleIdRef.current ??= newId()
        try {
            const { sale } = await createSale({
                id: saleIdRef.current,
                cart: cartRef.current,
                payments,
            })
            afterSave(sale)
            if (print) await printSale(sale.id)
        } catch (err) {
            setPayError(errorText(err) ?? 'Could not save the sale. Nothing was charged. Please try again.')
        } finally {
            setSaving(false)
        }
    }
    saveRef.current = correction ? null : handleSave

    // Saves the corrected bill: cancels the old one and makes a new invoice.
    async function completeCorrection(payment) {
        if (!correction) return 'There is no bill to correct.'
        saleIdRef.current ??= newId()
        try {
            const { sale } = await correctSale({
                oldSaleId: correction.sale.id,
                newSaleId: saleIdRef.current,
                reason: correction.reason,
                cart: cartRef.current,
                payment,
            })
            afterSave(sale)
            setCorrection(null)
            navigate('/billing', { replace: true, state: null })
            await printSale(sale.id)
            return null
        } catch (err) {
            return (
                errorText(err) ??
                'Could not save the corrected bill. The old bill was not changed. Please try again.'
            )
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
            .slice(0, 6)
        : []

    const quickOn = (percent) =>
        cart.billDiscount?.type === 'percent' && cart.billDiscount.value === percent
    const info = completed ? paymentInfo(completed) : null

    return (
        <div className="flex flex-col gap-3 lg:h-full lg:min-h-0 lg:flex-row">
            {/* Left: scanning and the items */}
            <section className="flex min-h-0 flex-col gap-3 lg:flex-1">
                {correction && (
                    <div
                        role="status"
                        data-testid="correction-banner"
                        className="shrink-0 space-y-2 rounded-xl border-l-4 border-amber-500 bg-amber-50 p-3"
                    >
                        <p className="font-semibold text-amber-900">Correcting {correction.sale.invoiceNumber}</p>
                        <p className="text-sm text-amber-900">
                            Reason: {correction.reason}. Original total {formatINR(correction.sale.totalPaise)}.
                            Saving cancels the old bill and makes a new invoice.
                        </p>
                        <button type="button" className={secondaryButton} onClick={handleCancelCorrection}>
                            Cancel correction
                        </button>
                    </div>
                )}

                <div className="shrink-0 space-y-2 rounded-xl bg-white p-3 shadow-sm">
                    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
                        <div className="min-w-48 flex-1">
                            <label htmlFor="bill-barcode" className="text-sm font-medium text-slate-700">
                                Barcode
                            </label>
                            <input
                                id="bill-barcode"
                                ref={inputRef}
                                autoFocus
                                autoComplete="off"
                                className={`${inputClass} mt-1`}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Scan or type a barcode, then press Enter"
                            />
                        </div>
                        <button type="submit" className={primaryButton}>
                            Add to bill
                        </button>
                        <button type="button" className={secondaryButton} onClick={() => setCameraOn((on) => !on)}>
                            {cameraOn ? 'Stop camera' : 'Camera'}
                        </button>
                        <button type="button" className={secondaryButton} onClick={handleSimulate}>
                            Simulate scan
                        </button>
                    </form>
                    <CameraScanner active={cameraOn} onScan={handleCode} />

                    <div>
                        <label htmlFor="bill-search" className="sr-only">
                            Search items
                        </label>
                        <input
                            id="bill-search"
                            className={inputClass}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search items by name, SKU or barcode"
                        />
                    </div>
                    {query && results.length === 0 && <p className="text-sm text-slate-500">No matching items.</p>}
                    {results.length > 0 && (
                        <ul className="max-h-40 space-y-1 overflow-y-auto">
                            {results.map(({ variant, product }) => (
                                <li key={variant.id}>
                                    <button
                                        type="button"
                                        aria-label={`Add ${product.name} size ${variant.size}`}
                                        className="flex w-full justify-between rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                                        onClick={() => {
                                            addToBill(variant, product)
                                            setSearch('')
                                        }}
                                    >
                                        <span>
                                            <span className="font-medium">{product.name}</span>
                                            <span className="block text-xs text-slate-500">
                                                Size {variant.size} · Stock {formatQuantity(variant.currentStock, variant.unit)}
                                            </span>
                                        </span>
                                        <span className="font-medium">
                                            {formatINR(variant.sellingPricePaise)}
                                            {variant.unit === 'meter' ? ' / m' : ''}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {notice && (
                    <p
                        role={notice.type === 'error' ? 'alert' : 'status'}
                        className={`shrink-0 rounded-lg p-2 text-sm ${notice.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}
                    >
                        {notice.text}
                    </p>
                )}

                {completed && (
                    <div
                        data-testid="sale-complete"
                        role="status"
                        className="shrink-0 space-y-2 rounded-xl border-l-4 border-green-500 bg-white p-3 shadow-sm"
                    >
                        <p className="font-semibold text-green-700">
                            {completed.replacesInvoice ? 'Corrected bill saved' : 'Bill saved'}
                        </p>
                        <p className="text-lg font-bold">Invoice {completed.invoiceNumber}</p>
                        {completed.replacesInvoice && (
                            <p className="text-sm text-slate-600">Replaces {completed.replacesInvoice} (now cancelled)</p>
                        )}
                        <p className="text-sm text-slate-600">
                            Total {formatINR(completed.totalPaise)} ·{' '}
                            {info.status === 'pending' ? (
                                <span className="font-semibold text-amber-700">Payment pending</span>
                            ) : (
                                <>
                                    Received {formatINR(info.receivedPaise)}
                                    {info.changePaise > 0 && ` · Change ${formatINR(info.changePaise)}`}
                                    {info.shortPaise > 0 && (
                                        <span className="font-semibold text-amber-700"> · Short {formatINR(info.shortPaise)}</span>
                                    )}
                                </>
                            )}
                        </p>
                        {printMsg && (
                            <p
                                data-testid="print-message"
                                role={printMsg.type === 'error' ? 'alert' : 'status'}
                                className={`rounded-lg p-2 text-sm ${printMsg.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                    }`}
                            >
                                {printMsg.text}
                            </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={primaryButton} onClick={() => printSale(completed.id)}>
                                Reprint
                            </button>
                            {!completed.replacesInvoice && (
                                <button type="button" className={secondaryButton} onClick={() => setShowRecord((s) => !s)}>
                                    {info.status === 'pending' ? 'Record payment' : 'Change payment'}
                                </button>
                            )}
                            <Link to={`/sales/${completed.id}`} className={secondaryButton}>
                                View sale
                            </Link>
                            <button type="button" className={secondaryButton} onClick={() => setCompleted(null)}>
                                New bill
                            </button>
                        </div>
                        {showRecord && <PaymentRecordPanel sale={completed} onSaved={(updated) => setCompleted(updated)} />}
                    </div>
                )}

                {cart.lines.length === 0 ? (
                    <p className="rounded-xl bg-white p-6 text-center text-slate-500 shadow-sm">
                        The bill is empty. Scan a barcode or search for an item.
                    </p>
                ) : (
                    <ul ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                        {ordered.map((line) =>
                            line.unit === 'meter' ? (
                                <CartLine
                                    key={line.variantId}
                                    line={line}
                                    totals={totalsByVariant.get(line.variantId)}
                                    focusRequest={focusRequest}
                                    onDone={() => inputRef.current?.focus({ preventScroll: true })}
                                    onQuantity={(q) =>
                                        applyChange((c) => setQuantity(c, line.variantId, q, { allowNegativeStock: stockRule }))
                                    }
                                    onRemove={() => applyChange((c) => removeItem(c, line.variantId))}
                                    onDiscount={(d) => applyChange((c) => setLineDiscount(c, line.variantId, d))}
                                />
                            ) : (
                                <BillLine
                                    key={line.variantId}
                                    line={line}
                                    totals={totalsByVariant.get(line.variantId)}
                                    highlight={line.variantId === flashId}
                                    onQuantity={(q) =>
                                        applyChange((c) => setQuantity(c, line.variantId, q, { allowNegativeStock: stockRule }))
                                    }
                                    onRemove={() => applyChange((c) => removeItem(c, line.variantId))}
                                    onDiscount={(d) => applyChange((c) => setLineDiscount(c, line.variantId, d))}
                                    onToggleExcluded={(excluded) =>
                                        applyChange((c) => setLineDiscountExcluded(c, line.variantId, excluded))
                                    }
                                />
                            ),
                        )}
                    </ul>
                )}
            </section>

            {/* Right: total, discount and payment, always visible */}
            <aside className="flex shrink-0 flex-col gap-3 lg:min-h-0 lg:w-96 lg:overflow-y-auto">
                {pendingCount > 0 && !correction && (
                    <Link
                        to="/sales?filter=pending"
                        className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900"
                    >
                        {pendingCount} {pendingCount === 1 ? 'bill' : 'bills'} waiting for payment →
                    </Link>
                )}

                <TotalsCard totals={totals} />

                <div className="space-y-2 rounded-xl bg-white p-3 shadow-sm">
                    <p className="font-semibold">Bill discount</p>
                    <div className="flex flex-wrap gap-2">
                        {QUICK_PERCENTS.map((percent) => (
                            <button
                                key={percent}
                                type="button"
                                aria-pressed={quickOn(percent)}
                                className={quickOn(percent) ? primaryButton : secondaryButton}
                                onClick={() =>
                                    applyChange((c) =>
                                        setBillDiscount(c, quickOn(percent) ? null : { type: 'percent', value: percent }),
                                    )
                                }
                            >
                                {percent}% off
                            </button>
                        ))}
                    </div>
                    <details>
                        <summary className="cursor-pointer text-sm text-slate-600">Other discount (percent or ₹)</summary>
                        <DiscountEditor
                            key={JSON.stringify(cart.billDiscount)}
                            label="Bill discount"
                            discount={cart.billDiscount}
                            onApply={(d) => applyChange((c) => setBillDiscount(c, d))}
                        />
                    </details>
                </div>

                {correction ? (
                    <CorrectionPayment
                        totalPaise={totals.totalPaise}
                        oldTotalPaise={correction.sale.totalPaise}
                        onComplete={completeCorrection}
                    />
                ) : (
                    <PayBox
                        form={payForm}
                        onForm={(next) => {
                            setPayForm(next)
                            setPayError('')
                        }}
                        totalPaise={totals.totalPaise}
                        saving={saving}
                        error={payError}
                        disabled={cart.lines.length === 0}
                        onSave={handleSave}
                    />
                )}

                {!correction && cart.lines.length > 0 && (
                    <button type="button" className={secondaryButton} onClick={handleClearBill}>
                        Clear bill
                    </button>
                )}
            </aside>
        </div>
    )
}