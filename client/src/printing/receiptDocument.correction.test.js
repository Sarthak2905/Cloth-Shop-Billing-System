import { buildReceiptDocument } from './receiptDocument'

const sale = (over = {}) => ({
  invoiceNumber: 'INV-000023',
  createdAt: '2026-11-14T12:27:00.000Z',
  shop: { name: 'Shop', address: '', phone: '', taxId: '', footer: '' },
  itemCount: 1,
  subtotalPaise: 59900,
  discountPaise: 0,
  taxAddedPaise: 0,
  taxPaise: 0,
  roundOffPaise: 0,
  totalPaise: 59900,
  payment: {
    method: 'cash',
    amountTenderedPaise: 59900,
    changePaise: 0,
    reference: '',
  },
  ...over,
})
const items = [
  {
    productName: 'Shirt',
    size: 'M',
    quantity: 1,
    unitPricePaise: 59900,
    grossPaise: 59900,
    lineDiscountPaise: 0,
    taxRatePercent: 0,
    taxPaise: 0,
  },
]
const textOf = (doc) =>
  doc.blocks
    .map((b) => [b.text, b.left, b.right].filter(Boolean).join(' '))
    .join('\n')

test('a cancelled bill says CANCELLED and which bill replaced it', () => {
  const cancelled = textOf(
    buildReceiptDocument(
      sale({ status: 'cancelled', replacedByInvoice: 'INV-000024' }),
      items,
    ),
  )
  expect(cancelled).toContain('CANCELLED')
  expect(cancelled).toContain('Replaced by: INV-000024')

  expect(
    textOf(buildReceiptDocument(sale({ status: 'completed' }), items)),
  ).not.toContain('CANCELLED')

  const marathi = textOf(
    buildReceiptDocument(
      sale({ status: 'cancelled', replacedByInvoice: 'INV-000024' }),
      items,
      { language: 'mr' },
    ),
  )
  expect(marathi).toContain('रद्द केलेले बिल')
  expect(marathi).toContain('नवीन बिल क्र.: INV-000024')
})

test('a corrected bill says which bill it replaces', () => {
  const text = textOf(
    buildReceiptDocument(sale({ replacesInvoice: 'INV-000023' }), items),
  )
  expect(text).toContain('Replaces bill: INV-000023')

  expect(textOf(buildReceiptDocument(sale(), items))).not.toContain(
    'Replaces bill',
  )
})
