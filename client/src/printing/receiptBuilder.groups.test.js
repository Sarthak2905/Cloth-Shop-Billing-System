import { buildReceipt } from './receiptBuilder'

const sale = {
  invoiceNumber: 'INV-000002',
  createdAt: '2026-11-14T12:25:00.000Z',
  shop: { name: 'Shop', address: '', phone: '', taxId: '', footer: '' },
  itemCount: 3,
  subtotalPaise: 53500,
  itemDiscountPaise: 0,
  billDiscountPaise: 5000,
  discountPaise: 5000,
  taxAddedPaise: 0,
  taxPaise: 0,
  roundOffPaise: 0,
  totalPaise: 48500,
  payment: {
    method: 'cash',
    amountTenderedPaise: 48500,
    changePaise: 0,
    reference: '',
  },
}
const piece = (name, size, price, over = {}) => ({
  productName: name,
  size,
  unit: 'piece',
  quantity: 1,
  unitPricePaise: price,
  grossPaise: price,
  lineDiscountPaise: 0,
  ...over,
})
const items = [
  piece('Astar', '', 3500, {
    unit: 'meter',
    quantity: 100,
    discountAllowed: false,
  }),
  piece('Shirt', 'M', 28000),
  piece('Pant', '32', 22000),
]

test('the printed text has the discounted items, the discount, then the items without one', () => {
  const { text } = buildReceipt(sale, items, { paperWidth: '80-42' })
  const at = (word) => text.indexOf(word)

  expect(at('Shirt (M)')).toBeGreaterThan(-1)
  expect(at('Pant (32)')).toBeLessThan(at('Subtotal (2)'))
  expect(at('Subtotal (2)')).toBeLessThan(at('After discount'))
  expect(at('After discount')).toBeLessThan(at('Astar'))
  expect(at('Astar')).toBeLessThan(at('TOTAL'))
  expect(text).toContain('1.00 m x 35.00')
  expect(text).toContain('450.00')
  expect(text).toContain('485.00')
})

test('an item without a size is printed without empty brackets', () => {
  const { text } = buildReceipt(sale, items, { paperWidth: '80-42' })

  expect(text).not.toContain('()')
  expect(text).not.toContain('(-)')
})

test('a bill without a bill discount keeps the plain layout', () => {
  const { text } = buildReceipt(
    { ...sale, billDiscountPaise: 0, discountPaise: 0, totalPaise: 53500 },
    items,
    { paperWidth: '80-42' },
  )

  expect(text).toContain('Subtotal (3)')
  expect(text).not.toContain('After discount')
})
