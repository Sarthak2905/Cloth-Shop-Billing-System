import { vi } from 'vitest'

// A time `minutes` after a fixed start, as the server writes it.
export const T = (minutes) =>
  new Date(Date.UTC(2026, 10, 19, 10, minutes)).toISOString()

export const product = (id, over = {}) => ({
  id,
  name: `Product ${id}`,
  category: 'Shirts',
  brand: '',
  supplier: '',
  discountAllowed: true,
  status: 'active',
  createdAt: T(0),
  updatedAt: T(1),
  ...over,
})

export const variant = (id, productId, over = {}) => ({
  id,
  productId,
  sku: id,
  barcode: 'CLO000001',
  size: 'M',
  unit: 'piece',
  packSize: null,
  costPaise: 30000,
  mrpPaise: 79900,
  sellingPricePaise: 79900,
  taxRatePercent: 5,
  priceIncludesTax: true,
  reorderThreshold: 3,
  currentStock: 10,
  status: 'active',
  createdAt: T(0),
  updatedAt: T(2),
  ...over,
})

export const movement = (id, variantId, over = {}) => ({
  id,
  variantId,
  type: 'opening',
  quantityChange: 10,
  stockAfter: 10,
  reason: 'Opening stock',
  referenceId: null,
  userId: 'u1',
  occurredAt: T(0),
  createdAt: T(3),
  ...over,
})

export const sale = (id, invoiceNumber, over = {}) => ({
  id,
  invoiceNumber,
  status: 'completed',
  soldAt: T(5),
  createdAt: T(6),
  updatedAt: T(6),
  shop: { name: 'Shop', address: '', phone: '', taxId: '', footer: '' },
  itemCount: 1,
  subtotalPaise: 79900,
  itemDiscountPaise: 0,
  billDiscountPaise: 0,
  discountPaise: 0,
  billDiscount: null,
  taxableValuePaise: 76095,
  taxPaise: 3805,
  taxIncludedPaise: 3805,
  taxAddedPaise: 0,
  exactTotalPaise: 79900,
  roundOffPaise: 0,
  totalPaise: 79900,
  payment: {
    method: 'cash',
    amountTenderedPaise: 79900,
    changePaise: 0,
    reference: '',
  },
  payments: [{ method: 'cash', amountPaise: 79900, reference: '' }],
  paymentStatus: 'paid',
  receivedPaise: 79900,
  shortPaise: 0,
  paymentRecordedAt: T(5),
  paymentRev: 0,
  flagged: false,
  flags: [],
  items: [
    {
      lineNumber: 1,
      variantId: 'v1',
      productId: 'p1',
      productName: 'Product p1',
      sku: 'v1',
      barcode: 'CLO000001',
      size: 'M',
      unit: 'piece',
      quantity: 1,
      unitPricePaise: 79900,
      mrpPaise: 79900,
      costPaise: 30000,
      taxRatePercent: 5,
      priceIncludesTax: true,
      discount: null,
      discountAllowed: true,
      discountExcluded: false,
      grossPaise: 79900,
      lineDiscountPaise: 0,
      billDiscountSharePaise: 0,
      taxableValuePaise: 76095,
      taxPaise: 3805,
      lineTotalPaise: 79900,
    },
  ],
  ...over,
})

const TIME_FIELD = {
  products: 'updatedAt',
  variants: 'updatedAt',
  sales: 'updatedAt',
  movements: 'createdAt',
}

// A server that answers pullPage the way the real one does: oldest change first, in pages,
// with a cursor. `data` can be changed between downloads.
export function fakeServer(data, { pageSize = 2 } = {}) {
  const calls = []
  const pullPage = vi.fn(async (kind, { after, limit } = {}) => {
    calls.push({ kind, after })
    const field = TIME_FIELD[kind]
    const rows = [...data[kind]].sort((a, b) =>
      a[field] === b[field]
        ? a.id < b.id
          ? -1
          : 1
        : a[field] < b[field]
          ? -1
          : 1,
    )
    let from = rows
    if (after) {
      const at = after.indexOf('|')
      const time = after.slice(0, at)
      const id = after.slice(at + 1)
      from = rows.filter(
        (r) => r[field] > time || (r[field] === time && r.id > id),
      )
    }
    const size = limit ?? pageSize
    const page = from.slice(0, size)
    const last = page.at(-1)
    return {
      items: page,
      cursor: last ? `${last[field]}|${last.id}` : (after ?? null),
      hasMore: from.length > size,
      serverTime: T(59),
    }
  })
  const pullSummary = vi.fn(async () => ({
    counts: Object.fromEntries(
      Object.keys(TIME_FIELD).map((kind) => [kind, data[kind]?.length ?? 0]),
    ),
  }))
  return { data, calls, pullPage, pullSummary }
}
