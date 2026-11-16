// Payments on a bill. A bill can be saved with NO payment (it is "pending"), and the
// payment is recorded later, as one or several lines: cash + UPI + card.
// Everything is for the shop's own records. None of it is printed on the customer's bill.

export const PAYMENT_METHODS = ['cash', 'upi', 'card']
const LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card' }

// Checks the payment lines and works out what was received. Returns { error } when a
// line is wrong, otherwise:
//   payments      the real lines (zero amounts dropped)
//   receivedPaise everything that was received
//   changePaise   money given back (only cash can give change)
//   shortPaise    what is still missing. A short bill is accepted (a bargain).
//   status        'pending' when nothing was received, otherwise 'paid'
//   summary       { method: 'cash'|'upi'|'card'|'split'|'pending', ... } kept on the bill
export function summarizePayments(totalPaise, raw) {
  const payments = []
  for (const p of raw ?? []) {
    if (!PAYMENT_METHODS.includes(p?.method))
      return { error: 'Unknown payment method' }
    const amount = p.amountPaise ?? 0
    if (!Number.isInteger(amount) || amount < 0)
      return { error: 'Enter a valid payment amount' }
    if (amount === 0) continue
    const reference = String(p.reference ?? '').trim()
    if (reference.length > 40)
      return { error: 'The reference is too long (40 characters at most)' }
    payments.push({ method: p.method, amountPaise: amount, reference })
  }

  const receivedPaise = payments.reduce((sum, p) => sum + p.amountPaise, 0)
  const cashPaise = payments
    .filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + p.amountPaise, 0)
  const over = Math.max(0, receivedPaise - totalPaise)
  if (over > cashPaise) {
    return {
      error:
        'UPI and card amounts cannot be more than the bill. Only cash can give change.',
    }
  }

  const methods = [...new Set(payments.map((p) => p.method))]
  const method =
    methods.length === 0
      ? 'pending'
      : methods.length === 1
        ? methods[0]
        : 'split'
  return {
    payments,
    receivedPaise,
    changePaise: over,
    shortPaise: Math.max(0, totalPaise - receivedPaise),
    status: payments.length === 0 ? 'pending' : 'paid',
    summary: {
      method,
      amountTenderedPaise: receivedPaise,
      changePaise: over,
      reference: payments.find((p) => p.reference)?.reference ?? '',
    },
  }
}

// The payment lines of a bill, also for older bills that only have one payment.
export function paymentBreakdown(sale) {
  if (Array.isArray(sale.payments)) {
    return sale.payments.map((p) => ({
      method: p.method,
      label: LABEL[p.method] ?? p.method,
      amountPaise: p.amountPaise,
      reference: p.reference ?? '',
    }))
  }
  const legacy = sale.payment
  if (!legacy || !LABEL[legacy.method]) return []
  return [
    {
      method: legacy.method,
      label: LABEL[legacy.method],
      amountPaise: legacy.amountTenderedPaise ?? sale.totalPaise,
      reference: legacy.reference ?? '',
    },
  ]
}

export function paymentInfo(sale) {
  if (sale.paymentStatus === 'pending') {
    return {
      status: 'pending',
      receivedPaise: 0,
      changePaise: 0,
      shortPaise: sale.totalPaise,
    }
  }
  if (Array.isArray(sale.payments)) {
    return {
      status: 'paid',
      receivedPaise: sale.receivedPaise ?? 0,
      changePaise: sale.payment?.changePaise ?? 0,
      shortPaise: sale.shortPaise ?? 0,
    }
  }
  return {
    status: 'paid',
    receivedPaise: sale.payment?.amountTenderedPaise ?? sale.totalPaise,
    changePaise: sale.payment?.changePaise ?? 0,
    shortPaise: 0,
  }
}

// "Cash", "Cash + UPI" or "Payment pending".
export function paymentText(sale) {
  if (sale.paymentStatus === 'pending') return 'Payment pending'
  return [...new Set(paymentBreakdown(sale).map((p) => p.label))].join(' + ')
}
