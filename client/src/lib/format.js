export const PAYMENT_LABEL = { cash: 'Cash', upi: 'UPI', card: 'Card' }

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
