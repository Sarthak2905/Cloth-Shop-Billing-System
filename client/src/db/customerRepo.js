import { db } from './db'
import {
  customerKey,
  groupBoughtItems,
  groupCustomers,
  normalizePhone,
} from '../lib/customer'

const withCustomer = (sale) => Boolean(sale.customerName || sale.customerPhone)

export async function listCustomers() {
  const sales = (await db.sales.toArray()).filter(withCustomer)
  return groupCustomers(sales)
}

// Customers whose name or number contains the typed text (for the suggestions on the billing screen).
export async function findCustomers(text, limit = 5) {
  const q = String(text ?? '')
    .trim()
    .toLowerCase()
  if (!q) return []
  const digits = normalizePhone(q)
  const all = await listCustomers()
  return all
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (digits.length >= 3 && c.phone.includes(digits)),
    )
    .slice(0, limit)
}

// One customer with every bill and everything they bought. null when there is none.
export async function getCustomerHistory(key) {
  const all = (await db.sales.toArray()).filter(withCustomer)
  const sales = all
    .filter((s) => customerKey(s) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (sales.length === 0) return null
  const ids = sales.map((s) => s.id)
  const items = await db.saleItems.where('saleId').anyOf(ids).toArray()
  items.sort((a, b) => a.lineNumber - b.lineNumber)
  const salesById = new Map(sales.map((s) => [s.id, s]))
  return {
    customer: groupCustomers(sales)[0] ?? {
      key,
      name: '',
      phone: '',
      visits: 0,
      totalPaise: 0,
      pendingPaise: 0,
      lastAt: '',
    },
    sales,
    itemsBySale: ids.map((id) => ({
      id,
      items: items.filter((i) => i.saleId === id),
    })),
    bought: groupBoughtItems(items, salesById),
  }
}
