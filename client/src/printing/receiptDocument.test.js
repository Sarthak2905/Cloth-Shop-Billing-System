import { buildFullReceipt, buildReceiptDocument } from './receiptDocument'

const sale = (over = {}) => ({
  invoiceNumber: 'INV-000022',
  createdAt: '2026-11-14T12:27:00.000Z',
  shop: {
    name: 'Sarthak Fashions',
    address: 'Main Road, Baramati\nPune 413102',
    phone: '9876543210',
    taxId: '',
    footer: '',
  },
  itemCount: 2,
  subtotalPaise: 84900,
  discountPaise: 8490,
  taxAddedPaise: 0,
  taxIncludedPaise: 3634,
  taxPaise: 3634,
  roundOffPaise: -10,
  totalPaise: 76400,
  payment: {
    method: 'cash',
    amountTenderedPaise: 76400,
    changePaise: 0,
    reference: '',
  },
  ...over,
})

const item = (over = {}) => ({
  productName: "Men's Casual Shirt",
  size: 'L',
  quantity: 1,
  unitPricePaise: 59900,
  grossPaise: 59900,
  lineDiscountPaise: 0,
  taxRatePercent: 5,
  taxPaise: 2300,
  ...over,
})

const items = [
  item(),
  item({
    productName: 'Cotton Shirt',
    size: 'M',
    unitPricePaise: 25000,
    grossPaise: 25000,
    taxPaise: 1334,
  }),
]

const textOf = (doc) =>
  doc.blocks
    .map((b) => [b.text, b.left, b.right].filter(Boolean).join(' '))
    .join('\n')

test('the document lists the shop, invoice, items, totals, payment and GST', () => {
  const text = textOf(buildReceiptDocument(sale(), items))

  for (const expected of [
    'Sarthak Fashions',
    'Main Road, Baramati',
    'Pune 413102',
    'Ph: 9876543210',
    'INV-000022',
    "Men's Casual Shirt (L)",
    '1 x 599.00',
    '-84.90',
    '-0.10',
    '764.00',
    'GST 5% 36.34',
  ]) {
    expect(text).toContain(expected)
  }
  expect(text).not.toContain('Includes tax')
})

test('the shop name is centred and bold, and the total is a bold row', () => {
  const { blocks } = buildReceiptDocument(sale(), items)

  expect(blocks[0]).toMatchObject({
    kind: 'center',
    text: 'Sarthak Fashions',
    bold: true,
    big: true,
  })
  const total = blocks.find((b) => b.kind === 'row' && b.left === 'TOTAL')
  expect(total).toMatchObject({ right: '764.00', bold: true, big: true })
})

test('each address line is its own centred line, kept whole', () => {
  const shop = {
    name: 'एस जी धोकटे कलेक्शन',
    address: 'जेऊर 413202\nजुना टेंभुर्णी रोड, सरकारी दवाखान्याजवळ',
    phone: '7350892009',
    taxId: '',
    footer: '',
  }
  const { blocks } = buildReceiptDocument(sale({ shop }), items, {
    language: 'mr',
  })

  const centred = blocks.filter((b) => b.kind === 'center').map((b) => b.text)
  expect(centred.slice(0, 4)).toEqual([
    'एस जी धोकटे कलेक्शन',
    'जेऊर 413202',
    'जुना टेंभुर्णी रोड, सरकारी दवाखान्याजवळ',
    'फोन: 7350892009',
  ])
})

test('a reprint carries the duplicate line, and Marathi labels (including GST) are used when asked', () => {
  const reprint = textOf(buildReceiptDocument(sale(), items, { reprint: true }))
  expect(reprint).toContain('DUPLICATE COPY')
  expect(textOf(buildReceiptDocument(sale(), items))).not.toContain(
    'DUPLICATE COPY',
  )

  const marathi = textOf(
    buildReceiptDocument(sale(), items, { language: 'mr' }),
  )
  expect(marathi).toContain('एकूण')
  expect(marathi).toContain('जीएसटी 5% 36.34')
  expect(marathi).not.toContain('Subtotal')
})

test('rows that do not apply are left out', () => {
  const plain = sale({
    discountPaise: 0,
    roundOffPaise: 0,
    taxPaise: 0,
    taxIncludedPaise: 0,
    taxAddedPaise: 0,
  })
  const noTax = items.map((i) => ({ ...i, taxRatePercent: 0, taxPaise: 0 }))
  const text = textOf(buildReceiptDocument(plain, noTax))

  for (const missing of ['Discount', 'Round off', 'Tax added', 'GST']) {
    expect(text).not.toContain(missing)
  }
})

test('GST is shown once for each tax rate in the bill', () => {
  const mixed = [
    item({ taxRatePercent: 5, taxPaise: 1000 }),
    item({ productName: 'Tee', taxRatePercent: 5, taxPaise: 500 }),
    item({ productName: 'Jacket', taxRatePercent: 12, taxPaise: 2000 }),
  ]
  const rows = buildReceiptDocument(sale(), mixed).blocks.filter(
    (b) => b.kind === 'row' && String(b.left).startsWith('GST'),
  )

  expect(rows.map((r) => [r.left, r.right])).toEqual([
    ['GST 5%', '15.00'],
    ['GST 12%', '20.00'],
  ])
})

test('an item with no size is printed without empty brackets', () => {
  const text = textOf(
    buildReceiptDocument(sale(), [
      item({ productName: 'Plain Tee', size: '-' }),
      item({ productName: 'Shirt', size: 'M' }),
    ]),
  )

  expect(text).toContain('Plain Tee')
  expect(text).not.toContain('Plain Tee (-)')
  expect(text).toContain('Shirt (M)')
})

test('the full receipt has both the fixed-width text and the layout document', () => {
  const receipt = buildFullReceipt(sale(), items, {
    paperWidth: '80-42',
    textSize: 'extra',
  })

  expect(receipt.text).toContain('INV-000022')
  expect(receipt.width).toBe(42)
  expect(receipt.document.textSize).toBe('extra')
  expect(receipt.document.paperWidth).toBe('80-42')
})
