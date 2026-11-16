import { isBlankInput, parseMoneyInput } from './entryInput.js'
import { paiseToRupees, formatINR } from './money.js'
import { paymentBreakdown } from './payments.js'

// What the cashier types: an amount for each way of paying.
export const EMPTY_PAYMENT_FORM = { cash: '', upi: '', card: '', upiRef: '' }

const FIELDS = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['card', 'Card'],
]

// { payments, error }: blank boxes are skipped, a wrong amount gives an error message.
export function paymentsFromForm(form) {
  const payments = []
  for (const [method, label] of FIELDS) {
    if (isBlankInput(form[method])) continue
    const amountPaise = parseMoneyInput(form[method])
    if (amountPaise === null) {
      return {
        payments: [],
        error: `Enter the ${label} amount like 500 or 500.50`,
      }
    }
    payments.push({
      method,
      amountPaise,
      reference: method === 'upi' ? form.upiRef : '',
    })
  }
  return { payments, error: null }
}

// Fills the boxes from a bill that already has a payment.
export function formFromSale(sale) {
  const form = { ...EMPTY_PAYMENT_FORM }
  for (const p of paymentBreakdown(sale)) {
    form[p.method] = paiseToRupees(p.amountPaise)
    if (p.method === 'upi') form.upiRef = p.reference ?? ''
  }
  return form
}

// "Received ₹1,000.00 · Short ₹20.00", or null when nothing was typed.
export function paymentStatusText(summary) {
  if (summary.payments.length === 0) return null
  const parts = [`Received ${formatINR(summary.receivedPaise)}`]
  if (summary.shortPaise > 0)
    parts.push(`Short ${formatINR(summary.shortPaise)}`)
  else if (summary.changePaise > 0)
    parts.push(`Change ${formatINR(summary.changePaise)}`)
  else parts.push('Exact')
  return parts.join(' · ')
}
