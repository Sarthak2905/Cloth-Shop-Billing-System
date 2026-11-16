import PaymentInputs from './PaymentInputs'
import { EMPTY_PAYMENT_FORM, paymentStatusText, paymentsFromForm } from '../lib/paymentForm'
import { paiseToRupees } from '../lib/money'
import { summarizePayments } from '../lib/payments'

const chip =
    'inline-block rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50'

// The payment area of the billing screen. Leave the boxes empty to save the bill as
// "payment pending", or type what was received (cash, UPI and card together).
// `onSave(print)` is called by the two buttons.
export default function PayBox({ form, onForm, totalPaise, saving, error, disabled, onSave }) {
    const { payments, error: formError } = paymentsFromForm(form)
    const summary = formError ? null : summarizePayments(totalPaise, payments)
    const problem = formError ?? summary?.error ?? null
    const statusLine = summary && !summary.error ? paymentStatusText(summary) : null
    const short = Boolean(summary && !summary.error && summary.shortPaise > 0 && payments.length > 0)
    const blocked = disabled || saving || Boolean(problem)

    return (
        <div className="space-y-3 rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="font-semibold">Payment received</p>
                <div className="flex gap-1">
                    <button
                        type="button"
                        className={chip}
                        disabled={disabled}
                        onClick={() => onForm({ ...form, cash: paiseToRupees(totalPaise) })}
                    >
                        Cash = total
                    </button>
                    <button type="button" className={chip} onClick={() => onForm(EMPTY_PAYMENT_FORM)}>
                        Clear
                    </button>
                </div>
            </div>

            <PaymentInputs idPrefix="pay" form={form} onChange={onForm} />

            {problem ? (
                <p role="alert" className="text-sm text-red-600">
                    {problem}
                </p>
            ) : statusLine ? (
                <p data-testid="pay-status" className={`text-sm font-semibold ${short ? 'text-amber-700' : 'text-green-700'}`}>
                    {statusLine}
                </p>
            ) : (
                <p data-testid="pay-status" className="text-sm text-slate-500">
                    Nothing typed: the bill is saved as payment pending.
                </p>
            )}

            {error && (
                <p role="alert" className="text-sm text-red-600">
                    {error}
                </p>
            )}

            <button
                type="button"
                disabled={blocked}
                onClick={() => onSave(true)}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? 'Saving...' : 'Save & print bill (F9)'}
            </button>
            <button
                type="button"
                disabled={blocked}
                onClick={() => onSave(false)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
                Save without printing
            </button>
            <p className="text-center text-xs text-slate-500">F2 = barcode box · F9 = save &amp; print</p>
        </div>
    )
}