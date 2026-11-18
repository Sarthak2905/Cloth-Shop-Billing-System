import { db } from './db.js'
import { AppError } from '../lib/errors.js'
import { summarizePayments } from '../lib/payments.js'

// Records (or replaces) the payment of a saved bill. This never touches the items,
// the totals or the stock, and it is never printed on the customer's bill.
// An empty list makes the bill "payment pending" again.
export async function recordPayments({ saleId, payments }) {
  return db.transaction('rw', db.sales, async () => {
    const sale = await db.sales.get(saleId)
    if (!sale) throw new AppError('NOT_FOUND', 'Bill not found')
    if (sale.status === 'cancelled') {
      throw new AppError(
        'NOT_PAYABLE',
        'A cancelled bill cannot take a payment',
      )
    }

    const result = summarizePayments(sale.totalPaise, payments)
    if (result.error) throw new AppError('INVALID_PAYMENT', result.error)

    const changes = {
      payment: result.summary,
      payments: result.payments,
      paymentStatus: result.status,
      receivedPaise: result.receivedPaise,
      shortPaise: result.shortPaise,
      paymentRecordedAt:
        result.status === 'paid' ? new Date().toISOString() : null,
      // a new version of the payment, still to be sent to the server
      paymentRev: (sale.paymentRev ?? 0) + 1,
      paymentPending: 1,
    }
    await db.sales.update(saleId, changes)
    return { ...sale, ...changes }
  })
}

// How many bills are waiting for their payment.
export function countPendingPayments() {
  return db.sales
    .where('paymentStatus')
    .equals('pending')
    .filter((sale) => sale.status === 'completed')
    .count()
}
