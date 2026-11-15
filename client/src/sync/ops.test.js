import {
  fingerprint,
  movementOp,
  productOp,
  saleOp,
  toRequestOp,
  variantOp,
} from './ops'

const product = {
  id: 'p1',
  name: 'Cotton Shirt',
  category: 'Shirts',
  brand: undefined,
  supplier: 'Pune Garments',
  status: 'active',
  createdAt: '2026-10-30T09:00:00.000Z',
  updatedAt: '2026-10-30T10:00:00.000Z',
  somethingElse: 'x',
}

const variant = {
  id: 'v1',
  productId: 'p1',
  sku: 'SHIRT-M',
  barcode: 'CLO000001',
  size: 'M',
  costPaise: 30000,
  mrpPaise: 99900,
  sellingPricePaise: 79900,
  taxRatePercent: 5,
  priceIncludesTax: true,
  reorderThreshold: 3,
  currentStock: 10,
  status: 'active',
  createdAt: '2026-10-30T09:00:00.000Z',
  updatedAt: '2026-10-30T10:00:00.000Z',
}

test('a product operation carries only what the server accepts', () => {
  const op = productOp(product)
  expect(op.type).toBe('product.upsert')
  expect(op.data).toEqual({
    id: 'p1',
    name: 'Cotton Shirt',
    category: 'Shirts',
    brand: '',
    supplier: 'Pune Garments',
    status: 'active',
    discountAllowed: true,
  })
  expect(op).toMatchObject({
    kind: 'product',
    entityId: 'p1',
    label: 'Cotton Shirt',
    key: '2026-10-30T10:00:00.000Z|p1',
  })
})

test('a product operation carries the discount setting, and older products count as allowing discounts', () => {
  expect(
    productOp({ ...product, discountAllowed: false }).data.discountAllowed,
  ).toBe(false)
  expect(
    productOp({ ...product, discountAllowed: true }).data.discountAllowed,
  ).toBe(true)
  expect(productOp(product).data.discountAllowed).toBe(true)
})

test('an item operation never carries stock, and its fingerprint ignores stock changes', () => {
  const a = variantOp(variant)
  const stockOnly = variantOp({
    ...variant,
    currentStock: 3,
    updatedAt: '2030-01-01T00:00:00.000Z',
  })
  const repriced = variantOp({ ...variant, sellingPricePaise: 70000 })

  expect(a.data).not.toHaveProperty('currentStock')
  expect(a.data).not.toHaveProperty('createdAt')
  expect(a.data).toMatchObject({
    id: 'v1',
    productId: 'p1',
    sku: 'SHIRT-M',
    sellingPricePaise: 79900,
  })
  expect(stockOnly.fingerprint).toBe(a.fingerprint)
  expect(repriced.fingerprint).not.toBe(a.fingerprint)
  expect(fingerprint('same')).toBe(fingerprint('same'))
})

test('a stock operation keeps its own id and time, and a very long reason is shortened', () => {
  const op = movementOp({
    id: 'm1',
    variantId: 'v1',
    type: 'adjustment',
    quantityChange: -2,
    stockAfter: 8,
    reason: 'x'.repeat(300),
    referenceId: null,
    createdAt: '2026-10-30T11:00:00.000Z',
  })

  expect(op.data).toMatchObject({
    id: 'm1',
    variantId: 'v1',
    type: 'adjustment',
    quantityChange: -2,
    createdAt: '2026-10-30T11:00:00.000Z',
  })
  expect(op.data.reason).toHaveLength(200)
  expect(op.data).not.toHaveProperty('stockAfter')
  expect(op.label).toBe('Stock adjustment -2')
})

test('a cash sale operation lists lines in order with discounts, and sends only what the server recalculates from', () => {
  const sale = {
    id: 's1',
    invoiceNumber: 'INV-000001',
    createdAt: '2026-10-30T10:00:00.000Z',
    billDiscount: { type: 'percent', value: 10 },
    totalPaise: 71900,
    payment: {
      method: 'cash',
      amountTenderedPaise: 80000,
      changePaise: 8100,
      reference: '',
    },
  }
  const items = [
    {
      lineNumber: 2,
      variantId: 'v2',
      quantity: 1,
      unitPricePaise: 129900,
      discount: null,
    },
    {
      lineNumber: 1,
      variantId: 'v1',
      quantity: 2,
      unitPricePaise: 79900,
      discount: { type: 'amount', value: 5000 },
    },
  ]

  const op = saleOp(sale, items)

  expect(op.type).toBe('sale.create')
  expect(op.data).toEqual({
    id: 's1',
    invoiceNumber: 'INV-000001',
    soldAt: '2026-10-30T10:00:00.000Z',
    offline: true,
    lines: [
      {
        variantId: 'v1',
        quantity: 2,
        unitPricePaise: 79900,
        discount: { type: 'amount', value: 5000 },
      },
      { variantId: 'v2', quantity: 1, unitPricePaise: 129900 },
    ],
    billDiscount: { type: 'percent', value: 10 },
    payment: { method: 'cash', amountTenderedPaise: 80000 },
    claimedTotalPaise: 71900,
  })
})

test('a line with discounts switched off is sent with a no-discount mark, and other lines are not', () => {
  const sale = {
    id: 's3',
    invoiceNumber: 'INV-000003',
    createdAt: '2026-10-30T10:00:00.000Z',
    billDiscount: { type: 'percent', value: 10 },
    totalPaise: 100000,
    payment: {
      method: 'cash',
      amountTenderedPaise: 100000,
      changePaise: 0,
      reference: '',
    },
  }
  const op = saleOp(sale, [
    {
      lineNumber: 1,
      variantId: 'v1',
      quantity: 1,
      unitPricePaise: 79900,
      discount: null,
    },
    {
      lineNumber: 2,
      variantId: 'v2',
      quantity: 1,
      unitPricePaise: 129900,
      discount: null,
      discountExcluded: true,
    },
  ])

  expect(op.data.lines[0]).not.toHaveProperty('noDiscount')
  expect(op.data.lines[1].noDiscount).toBe(true)
})

test('a UPI sale sends its reference but no cash amount, and no empty discount', () => {
  const sale = {
    id: 's2',
    invoiceNumber: 'INV-000002',
    createdAt: '2026-10-30T10:00:00.000Z',
    billDiscount: null,
    totalPaise: 79900,
    payment: {
      method: 'upi',
      amountTenderedPaise: 79900,
      changePaise: 0,
      reference: 'UPI123',
    },
  }
  const op = saleOp(sale, [
    {
      lineNumber: 1,
      variantId: 'v1',
      quantity: 1,
      unitPricePaise: 79900,
      discount: null,
    },
  ])

  expect(op.data.payment).toEqual({ method: 'upi', reference: 'UPI123' })
  expect(op.data).not.toHaveProperty('billDiscount')
  expect(op.data.lines[0]).not.toHaveProperty('discount')
})

test('toRequestOp removes everything the server does not expect', () => {
  const op = toRequestOp(productOp(product))
  expect(Object.keys(op).sort()).toEqual(['data', 'type'])
})
