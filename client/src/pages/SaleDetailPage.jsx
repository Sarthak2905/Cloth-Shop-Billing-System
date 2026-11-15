import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSale } from '../db/saleRepo'
import { getSettings } from '../db/settingsRepo'
import { buildFullReceipt } from '../printing/receiptDocument'
import { PRINTER_CHOICES, createPrinter } from '../printing/printerFactory'
import { listPrintJobs, printReceipt } from '../printing/printService'
import BillTotals from '../components/BillTotals'
import CorrectBillPanel from '../components/CorrectBillPanel'
import FormField from '../components/FormField'
import ReceiptPreview from '../components/ReceiptPreview'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { PAYMENT_LABEL, formatDateTime } from '../lib/format'
import { formatINR } from '../lib/money'

const CONFIRMATION_TEXT = {
    simulated: 'simulated only, nothing was physically printed',
    handed_off: 'sent to the printer, not confirmed',
    device_confirmed: 'confirmed by the printer',
    none: 'no confirmation',
}

function jobStatusText(job) {
    if (job.status === 'completed') {
        return `Done (${CONFIRMATION_TEXT[job.confirmation] ?? job.confirmation})`
    }
    if (job.status === 'failed') return `Failed: ${job.error}`
    return 'Result unknown (check the paper)'
}

export default function SaleDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    // undefined = loading, null = not found
    const data = useLiveQuery(async () => (await getSale(id)) ?? null, [id])
    const settings = useLiveQuery(() => getSettings(), [])
    const jobs = useLiveQuery(() => listPrintJobs(id), [id])

    const [widthChoice, setWidthChoice] = useState(null)
    const [languagePick, setLanguagePick] = useState(null)
    const [printerPick, setPrinterPick] = useState(null)
    const [printing, setPrinting] = useState(false)
    const [message, setMessage] = useState(null)
    const [showCorrect, setShowCorrect] = useState(false)

    const paperWidth = widthChoice ?? settings?.receiptPaperWidth ?? '58'
    const language = languagePick ?? settings?.receiptLanguage ?? 'en'
    const printerChoice = printerPick ?? settings?.receiptPrinter ?? 'simulated:ok'
    const hasPrinted = (jobs ?? []).some((job) => job.status === 'completed')

    // The preview shows what the NEXT print will look like (including the
    // duplicate marker once a print has really completed).
    const textSize = settings?.receiptTextSize ?? 'large'
    const receipt = useMemo(
        () =>
            data
                ? buildFullReceipt(data.sale, data.items, {
                    paperWidth,
                    language,
                    reprint: hasPrinted,
                    textSize,
                })
                : null,
        [data, paperWidth, language, hasPrinted, textSize],
    )

    async function handlePrint() {
        if (printing) return
        setPrinting(true)
        setMessage(null)
        try {
            const job = await printReceipt({
                saleId: id,
                printer: createPrinter(printerChoice),
                paperWidth,
                language,
            })
            if (job.status === 'completed') {
                setMessage({
                    type: 'ok',
                    text: `Print recorded: ${CONFIRMATION_TEXT[job.confirmation] ?? job.confirmation}.`,
                })
            } else {
                setMessage({ type: 'error', text: job.error })
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message })
        } finally {
            setPrinting(false)
        }
    }

    // The owner PIN was accepted: open the bill on the billing screen for correction.
    function handleAuthorized({ reason }) {
        navigate('/billing', {
            state: { correction: { saleId: id, reason, authorizedAt: Date.now() } },
        })
    }

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

            {sale.status === 'cancelled' && (
                <div
                    role="status"
                    data-testid="cancelled-banner"
                    className="rounded-xl border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-900"
                >
                    <p className="font-semibold">This bill was cancelled</p>
                    <p>
                        {formatDateTime(sale.cancelledAt)} · Reason: {sale.cancelReason}
                    </p>
                    {sale.replacedBySaleId && (
                        <p>
                            Replaced by{' '}
                            <Link to={`/sales/${sale.replacedBySaleId}`} className="font-semibold underline">
                                {sale.replacedByInvoice}
                            </Link>
                        </p>
                    )}
                </div>
            )}

            {sale.replacesSaleId && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    This bill replaces{' '}
                    <Link to={`/sales/${sale.replacesSaleId}`} className="font-semibold underline">
                        {sale.replacesInvoice}
                    </Link>
                </p>
            )}

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

            {sale.status === 'completed' &&
                (showCorrect ? (
                    <CorrectBillPanel invoiceNumber={sale.invoiceNumber} onAuthorized={handleAuthorized} />
                ) : (
                    <button type="button" className={secondaryButton} onClick={() => setShowCorrect(true)}>
                        Correct this bill
                    </button>
                ))}

            <h3 className="text-lg font-bold">Receipt</h3>

            <div className="grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-3">
                <FormField label="Paper width" htmlFor="rc-width">
                    <select
                        id="rc-width"
                        className={inputClass}
                        value={paperWidth}
                        onChange={(e) => setWidthChoice(e.target.value)}
                    >
                        <option value="58">58 mm (32 characters)</option>
                        <option value="80">80 mm (48 characters)</option>
                        <option value="80-42">80 mm (42 characters)</option>
                    </select>
                </FormField>
                <FormField label="Receipt language" htmlFor="rc-lang">
                    <select
                        id="rc-lang"
                        className={inputClass}
                        value={language}
                        onChange={(e) => setLanguagePick(e.target.value)}
                    >
                        <option value="en">English</option>
                        <option value="mr">मराठी</option>
                    </select>
                </FormField>
                <FormField label="Printer" htmlFor="rc-printer">
                    <select
                        id="rc-printer"
                        className={inputClass}
                        value={printerChoice}
                        onChange={(e) => setPrinterPick(e.target.value)}
                    >
                        {Object.entries(PRINTER_CHOICES).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </FormField>
            </div>

            <ReceiptPreview receipt={receipt} />

            <div className="space-y-2">
                <button
                    type="button"
                    className={primaryButton}
                    disabled={printing}
                    onClick={handlePrint}
                >
                    {printing ? 'Printing...' : hasPrinted ? 'Reprint receipt' : 'Print receipt'}
                </button>
                <p className="text-xs text-slate-500">
                    {printerChoice === 'browser'
                        ? 'This sends the receipt to the Windows printer. The app cannot tell whether paper came out, so it records "sent to the printer".'
                        : 'This is a simulated printer: nothing comes out. Choose "Windows printer" to print for real.'}{' '}
                    The sale is already saved, so a print problem never loses it.
                </p>
                {message && (
                    <p
                        data-testid="print-message"
                        role={message.type === 'error' ? 'alert' : 'status'}
                        className={`rounded-lg p-3 text-sm ${message.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}
                    >
                        {message.text}
                    </p>
                )}
            </div>

            {jobs && jobs.length > 0 && (
                <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h4 className="mb-2 font-semibold">Print history</h4>
                    <ul className="space-y-1 text-sm text-slate-600">
                        {jobs.map((job) => (
                            <li key={job.id} data-testid="print-job">
                                {formatDateTime(job.createdAt)} · {job.isReprint ? 'Reprint' : 'Print'} ·{' '}
                                {jobStatusText(job)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}