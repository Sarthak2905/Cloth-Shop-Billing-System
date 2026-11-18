import {
  fingerprint,
  saleCancelOp,
  saleOp,
  salePaymentOp,
  toRequestOp,
  variantOp,
} from './ops'

const fabric = {
  id: 'v1',
  productId: 'p1',
  sku: '',
  barcode: 'CLO000001',
  size: '',
  unit: 'meter',
  costPaise: 30000,
  mrpPaise: 45000,
  sellingPricePaise: 45000,
  taxRatePercent: 5,
  priceIncludesTax: true,
  reorderThreshold: 300,
  currentStock: 2550,
  status: 'active',
  createdAt: '2026-11-17T09:00:00.000Z',
  updatedAt: '2026-11-17T09:00:00.000Z',
}

test('an item carries its unit, and an empty size and SKU are sent as empty text', () => {
  expect(variantOp(fabric).data).toEqual({
    id: 'v1',
    productId: 'p1',
    sku: '',
    barcode: 'CLO000001',
    size: '',
    unit: 'meter',
    costPaise: 30000,
    mrpPaise: 45000,
    sellingPricePaise: 45000,
    taxRatePercent: 5,
    priceIncludesTax: true,
    reorderThreshold: 300,
    status: 'active',
  })
})

test('an older item without a unit is a piece, and the box size is sent only when there is one', () => {
  const old = variantOp({
    ...fabric,
    unit: undefined,
    sku: undefined,
    size: undefined,
  })
  expect(old.data).toMatchObject({ unit: 'piece', sku: '', size: '' })
  expect(old.data).not.toHaveProperty('packSize')

  expect(
    variantOp({ ...fabric, unit: 'piece', packSize: 10 }).data.packSize,
  ).toBe(10)
  expect(variantOp({ ...fabric, packSize: null }).data).not.toHaveProperty(
    'packSize',
  )
})

test('the fingerprint changes with the unit and the box size, but not with the stock', () => {
  const base = variantOp(fabric).fingerprint

  expect(variantOp({ ...fabric, currentStock: 1 }).fingerprint).toBe(base)
  expect(variantOp({ ...fabric, unit: 'piece' }).fingerprint).not.toBe(base)
  expect(variantOp({ ...fabric, packSize: 10 }).fingerprint).not.toBe(base)
  expect(fingerprint('a')).toBe(fingerprint('a'))
})

const sale = (over = {}) => ({
  id: 's1',
  invoiceNumber: 'INV-000030',
  createdAt: '2026-11-17T10:00:00.000Z',
  billDiscount: null,
  totalPaise: 102000,
  payments: [],
  ...over,
})
const item = (over = {}) => ({
  lineNumber: 1,
  variantId: 'v1',
  quantity: 2,
  unitPricePaise: 51000,
  discount: null,
  ...over,
})

test('a bill with no payment is sent with an empty payment list (payment pending)', () => {
  const op = saleOp(sale(), [item()])

  expect(op.data).toEqual({
    id: 's1',
    invoiceNumber: 'INV-000030',
    soldAt: '2026-11-17T10:00:00.000Z',
    offline: true,
    lines: [{ variantId: 'v1', quantity: 2, unitPricePaise: 51000 }],
    payments: [],
    claimedTotalPaise: 102000,
  })
  expect(op.data).not.toHaveProperty('payment')
})

test('a split payment is sent line by line, with empty references left out', () => {
  const op = saleOp(
    sale({
      payments: [
        { method: 'cash', amountPaise: 50000, reference: '' },
        { method: 'upi', amountPaise: 52000, reference: 'T9' },
      ],
    }),
    [item()],
  )

  expect(op.data.payments).toEqual([
    { method: 'cash', amountPaise: 50000 },
    { method: 'upi', amountPaise: 52000, reference: 'T9' },
  ])
})

test('each line carries what the item cost, and a no-discount mark for items that never take a discount', () => {
  const op = saleOp(sale(), [
    item({ costPaise: 32000 }),
    item({
      lineNumber: 2,
      variantId: 'v2',
      discountAllowed: false,
      costPaise: 0,
    }),
    item({ lineNumber: 3, variantId: 'v3', discountExcluded: true }),
    item({ lineNumber: 4, variantId: 'v4' }),
  ])

  expect(op.data.lines).toEqual([
    { variantId: 'v1', quantity: 2, unitPricePaise: 51000, costPaise: 32000 },
    {
      variantId: 'v2',
      quantity: 2,
      unitPricePaise: 51000,
      noDiscount: true,
      costPaise: 0,
    },
    { variantId: 'v3', quantity: 2, unitPricePaise: 51000, noDiscount: true },
    { variantId: 'v4', quantity: 2, unitPricePaise: 51000 },
  ])
})

test('a corrected bill says which bill it replaces, and the operation remembers its payment version', () => {
  const plain = saleOp(sale(), [item()])
  expect(plain.data).not.toHaveProperty('replacesSaleId')
  expect(plain.paymentRev).toBe(0)

  const corrected = saleOp(
    sale({
      replacesSaleId: 's0',
      replacesInvoice: 'INV-000029',
      paymentRev: 3,
    }),
    [item()],
  )
  expect(corrected.data).toMatchObject({
    replacesSaleId: 's0',
    replacesInvoice: 'INV-000029',
  })
  expect(corrected.paymentRev).toBe(3)
})

test('a payment recorded later is its own operation with a version number', () => {
  const op = salePaymentOp(
    sale({
      payments: [{ method: 'cash', amountPaise: 100000, reference: '' }],
      paymentRecordedAt: '2026-11-17T11:00:00.000Z',
      paymentRev: 2,
    }),
  )

  expect(op.type).toBe('sale.payment')
  expect(op.data).toEqual({
    saleId: 's1',
    payments: [{ method: 'cash', amountPaise: 100000 }],
    recordedAt: '2026-11-17T11:00:00.000Z',
    rev: 2,
  })
  expect(op).toMatchObject({
    kind: 'salepay',
    entityId: 's1',
    label: 'Payment of INV-000030',
    paymentRev: 2,
  })
})

test('clearing a payment sends an empty list and no time', () => {
  const op = salePaymentOp(
    sale({ payments: [], paymentRecordedAt: null, paymentRev: 3 }),
  )

  expect(op.data).toEqual({ saleId: 's1', payments: [], rev: 3 })
})

test('a cancelled bill is its own operation, with the replacing bill when there is one', () => {
  const full = saleCancelOp(
    sale({
      cancelledAt: '2026-11-17T12:00:00.000Z',
      cancelReason: 'Wrong price',
      replacedBySaleId: 's2',
      replacedByInvoice: 'INV-000031',
    }),
  )
  expect(full.type).toBe('sale.cancel')
  expect(full.data).toEqual({
    saleId: 's1',
    cancelledAt: '2026-11-17T12:00:00.000Z',
    reason: 'Wrong price',
    replacedBySaleId: 's2',
    replacedByInvoice: 'INV-000031',
  })
  expect(full).toMatchObject({
    kind: 'salecancel',
    label: 'Cancellation of INV-000030',
  })

  const alone = saleCancelOp(
    sale({
      cancelledAt: '2026-11-17T12:00:00.000Z',
      cancelReason: 'Other',
      replacedByInvoice: '',
    }),
  )
  expect(alone.data).toEqual({
    saleId: 's1',
    cancelledAt: '2026-11-17T12:00:00.000Z',
    reason: 'Other',
  })
})

test('only the type and the data are sent to the server', () => {
  for (const op of [
    saleOp(sale(), [item()]),
    salePaymentOp(sale()),
    saleCancelOp(
      sale({ cancelledAt: '2026-11-17T12:00:00.000Z', cancelReason: 'x' }),
    ),
  ]) {
    expect(Object.keys(toRequestOp(op)).sort()).toEqual(['data', 'type'])
  }
})
