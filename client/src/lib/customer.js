import { AppError } from './errors.js'

export const PHONE_ERROR = 'Enter a 10-digit mobile number (or leave it empty)'

// "+91 98765-43210", "098765 43210" and "9876543210" all become 9876543210.
export function normalizePhone(input) {
  let digits = String(input ?? '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

// { phone, error }: an empty number is fine, a wrong one gives an error.
export function checkPhone(input) {
  const phone = normalizePhone(input)
  if (!phone) return { phone: '', error: '' }
  if (!/^[6-9]\d{9}$/.test(phone)) return { phone, error: PHONE_ERROR }
  return { phone, error: '' }
}

export const cleanName = (input) =>
  String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

// Used when saving a bill. Throws on a wrong phone number.
export function normalizeCustomer(customer) {
  const name = cleanName(customer?.name)
  const { phone, error } = checkPhone(customer?.phone)
  if (error) throw new AppError('VALIDATION_ERROR', error)
  return { name, phone }
}

// One customer = one mobile number. Without a number, the same name counts as one customer.
export function customerKey(sale) {
  if (sale?.customerPhone) return sale.customerPhone
  const name = cleanName(sale?.customerName).toLowerCase()
  return name ? `n:${name}` : ''
}

// Does a bill match what was typed in a search box (name, number or invoice number)?
export function saleMatches(sale, text) {
  const q = String(text ?? '')
    .trim()
    .toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  return (
    String(sale.invoiceNumber ?? '')
      .toLowerCase()
      .includes(q) ||
    String(sale.customerName ?? '')
      .toLowerCase()
      .includes(q) ||
    (digits.length >= 3 && String(sale.customerPhone ?? '').includes(digits))
  )
}

// All customers from a list of bills. Cancelled bills are not counted.
export function groupCustomers(sales) {
  const map = new Map()
  for (const sale of sales) {
    const key = customerKey(sale)
    if (!key || sale.status === 'cancelled') continue
    let c = map.get(key)
    if (!c) {
      c = {
        key,
        name: '',
        phone: sale.customerPhone ?? '',
        visits: 0,
        totalPaise: 0,
        pendingPaise: 0,
        lastAt: '',
      }
      map.set(key, c)
    }
    c.visits += 1
    c.totalPaise += sale.totalPaise
    if (sale.paymentStatus === 'pending') c.pendingPaise += sale.totalPaise
    if (sale.createdAt > c.lastAt) {
      c.lastAt = sale.createdAt
      if (sale.customerName) c.name = sale.customerName // the newest spelling wins
    }
    if (!c.name && sale.customerName) c.name = sale.customerName
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

// What this customer bought, one row per item and size, newest first.
export function groupBoughtItems(items, salesById) {
  const map = new Map()
  for (const item of items) {
    const sale = salesById.get(item.saleId)
    if (!sale || sale.status === 'cancelled') continue
    let row = map.get(item.variantId)
    if (!row) {
      row = {
        variantId: item.variantId,
        productName: item.productName,
        size: item.size,
        unit: item.unit ?? 'piece',
        quantity: 0,
        times: 0,
        lastAt: '',
      }
      map.set(item.variantId, row)
    }
    row.quantity += item.quantity
    row.times += 1
    if (sale.createdAt > row.lastAt) row.lastAt = sale.createdAt
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}
