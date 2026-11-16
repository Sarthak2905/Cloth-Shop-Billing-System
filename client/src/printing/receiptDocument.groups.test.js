import { buildReceiptDocument } from './receiptDocument'

const sale = (over = {}) => ({
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
  ...over,
})
const piece = (name, price) => ({
  productName: name,
  size: '',
  unit: 'piece',
  quantity: 1,
  unitPricePaise: price,
  grossPaise: price,
  lineDiscountPaise: 0,
  taxRatePercent: 0,
  taxPaise: 0,
})
const shirt = piece('Shirt', 28000)
const pant = piece('Pant', 22000)
const lining = {
  ...piece('Astar', 3500),
  unit: 'meter',
  quantity: 100,
  discountAllowed: false,
}

// Every text line and row of the receipt, from the heading of the item list on.
function lines(doc, from = 'Item | Amount (Rs)') {
  const all = doc.blocks
    .filter((b) => b.kind === 'row' || b.kind === 'text')
    .map((b) => (b.kind === 'text' ? b.text : `${b.left} | ${b.right}`))
  return all.slice(all.indexOf(from))
}

test('the discounted items come first, then the discount, then the items without one', () => {
  const doc = buildReceiptDocument(sale(), [shirt, pant, lining])

  expect(lines(doc).slice(0, 11)).toEqual([
    'Item | Amount (Rs)',
    'Shirt',
    '1 x 280.00 | 280.00',
    'Pant',
    '1 x 220.00 | 220.00',
    'Subtotal (2) | 500.00',
    'Discount | -50.00',
    'After discount | 450.00',
    'Astar',
    '1.00 m x 35.00 | 35.00',
    'TOTAL | 485.00',
  ])
})

test('the order the items were typed in makes no difference', () => {
  const typedLast = buildReceiptDocument(sale(), [shirt, pant, lining])
  const typedFirst = buildReceiptDocument(sale(), [lining, shirt, pant])

  expect(lines(typedFirst)).toEqual(lines(typedLast))
})

test('when every item took the discount there is only one group', () => {
  const doc = buildReceiptDocument(
    sale({ itemCount: 2, subtotalPaise: 50000, totalPaise: 45000 }),
    [shirt, pant],
  )

  expect(lines(doc).slice(0, 8)).toEqual([
    'Item | Amount (Rs)',
    'Shirt',
    '1 x 280.00 | 280.00',
    'Pant',
    '1 x 220.00 | 220.00',
    'Subtotal (2) | 500.00',
    'Discount | -50.00',
    'After discount | 450.00',
  ])
  expect(lines(doc)[8]).toBe('TOTAL | 450.00')
})

test('a bill without a bill discount stays one plain list', () => {
  const doc = buildReceiptDocument(
    sale({ billDiscountPaise: 0, discountPaise: 0, totalPaise: 53500 }),
    [shirt, pant, lining],
  )
  const text = lines(doc).join('\n')

  expect(text).toContain('Subtotal (3) | 535.00')
  expect(text).not.toContain('After discount')
  expect(text).not.toContain('Discount |')
})

test('tax added and round off stay between the items and the total', () => {
  const doc = buildReceiptDocument(
    sale({ taxAddedPaise: 100, roundOffPaise: -10, totalPaise: 48590 }),
    [shirt, pant, lining],
  )
  const all = lines(doc)

  const at = (text) => all.indexOf(text)
  expect(at('1.00 m x 35.00 | 35.00')).toBeLessThan(at('Tax added | 1.00'))
  expect(at('Tax added | 1.00')).toBeLessThan(at('Round off | -0.10'))
  expect(at('Round off | -0.10')).toBeLessThan(at('TOTAL | 485.90'))
})

test('the Marathi labels are used for the groups', () => {
  const doc = buildReceiptDocument(sale(), [shirt, pant, lining], {
    language: 'mr',
  })
  const all = lines(doc, 'तपशील | रक्कम (रु)')

  expect(all).toContain('उप-एकूण (2) | 500.00')
  expect(all).toContain('सूट | -50.00')
  expect(all).toContain('सूटनंतर | 450.00')
  expect(all).toContain('एकूण | 485.00')
})
