import { useState } from 'react'
import PaymentInputs from './PaymentInputs'
import { primaryButton, secondaryButton } from './styles'
import { recordPayments } from '../db/paymentRepo'
import { AppError } from '../lib/errors'
import { EMPTY_PAYMENT_FORM, formFromSale, paymentStatusText, paymentsFromForm } from '../lib/paymentForm'
import { formatINR, paiseToRupees } from '../lib/money'
import { paymentInfo, summarizePayments } from '../lib/payments'

// Records what the customer really paid, after the bill was given. This is only for the
// shop's own records: it is never printed on the customer's bill.
export default function PaymentRecordPanel({ sale, onSaved }) {
    const pending = paymentInfo(sale).status === 'pending'
    const [form, setForm] = useState(() => formFromSale(sale))
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)
    const [saving, setSaving] = useState(false)

    const { payments, error: formError } = paymentsFromForm(form)
    const summary = formError ? null : summarizePayments(sale.totalPaise, payments)
    const statusLine = summary && !summary.error ? paymentStatusText(summary) : null
    const problem = formError ?? summary?.error ?? null

    function change(next) {
        setForm(next)
        setSaved(false)
        setError('')
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (saving) return
        setError('')
        setSaved(false)
        if (problem) {
            setError(problem)
            return
        }
        setSaving(true)
        try {
            const updated = await recordPayments({ saleId: sale.id, payments })
            setSaved(true)
            onSaved?.(updated)
        } catch (err) {
            if (!(err instanceof AppError)) console.error(err)
            setError(err instanceof AppError ? err.message : 'Could not save the payment. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            data-testid="payment-record-panel"
            className="space-y-3 rounded-xl bg-white p-4 shadow-sm"
            noValidate
        >
            <div>
                <p className="font-semibold">{pending ? 'Record payment' : 'Change payment'}</p>
                <p className="text-xs text-slate-500">
                    Bill total {formatINR(sale.totalPaise)}. This is only for your records. It is never printed on
                    the customer&apos;s bill.
                </p>
            </div>

            <PaymentInputs idPrefix={`rec-${sale.id}`} form={form} onChange={change} />

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => change({ ...form, cash: paiseToRupees(sale.totalPaise) })}
                >
                    Cash = bill total
                </button>
                <button type="button" className={secondaryButton} onClick={() => change(EMPTY_PAYMENT_FORM)}>
                    Clear
                </button>
            </div>

            {statusLine && <p className="text-sm font-semibold">{statusLine}</p>}
            {(error || problem) && (
                <p role="alert" className="text-sm text-red-600">
                    {error || problem}
                </p>
            )}
            {saved && (
                <p role="status" className="rounded-lg bg-green-100 p-2 text-sm text-green-800">
                    Payment recorded
                </p>
            )}

            <button type="submit" className={primaryButton} disabled={saving}>
                {saving ? 'Saving...' : 'Save payment'}
            </button>
        </form>
    )
}