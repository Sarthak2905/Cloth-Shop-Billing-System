import { buildReceipt } from './receiptBuilder'
import { visualLength } from './textLayout'

const sale = (over = {}) => ({
  invoiceNumber: 'INV-000001',
  createdAt: '2026-10-29T10:45:00.000Z',
  shop: {
    name: 'एस जी धोकटे कलेक्शन, जेऊर',
    address: 'जेऊर | जुना टेंभुर्णी रोड, सरकारी दवाखान्याजवळ',
    phone: '7350892009',
    taxId: '',
    footer: '',
  },
  itemCount: 1,
  subtotalPaise: 79900,
  discountPaise: 7990,
  taxAddedPaise: 0,
  taxIncludedPaise: 3424,
  roundOffPaise: -10,
  totalPaise: 71900,
  payment: {
    method: 'cash',
    amountTenderedPaise: 80000,
    changePaise: 8100,
    reference: '',
  },
  ...over,
})

const item = (over = {}) => ({
  productName: 'Cotton Shirt',
  size: 'M',
  quantity: 1,
  unitPricePaise: 79900,
  grossPaise: 79900,
  lineDiscountPaise: 0,
  ...over,
})

test('prints the shop, invoice, items, totals and payment', () => {
  const withTaxId = sale({ shop: { ...sale().shop, taxId: '27ABCDE1234F1Z5' } })
  const { text } = buildReceipt(withTaxId, [item()])

  for (const expected of [
    'एस जी धोकटे कलेक्शन, जेऊर',
    'जुना टेंभुर्णी रोड, सरकारी दवाखान्याजवळ',
    'Ph: 7350892009',
    'GSTIN: 27ABCDE1234F1Z5',
    'INV-000001',
    'Date:',
    'Cotton Shirt (M)',
    '1 x 799.00',
    '-79.90',
    '-0.10',
    '719.00',
    'Cash',
    '800.00',
    '81.00',
    'Includes tax',
    '34.24',
  ]) {
    expect(text).toContain(expected)
  }
})

test('every line fits the paper width and the TOTAL row spans it', () => {
  const longItem = item({
    productName: 'Premium Slim Fit Cotton Casual Shirt With Long Sleeves',
  })
  for (const [paper, columns] of [
    ['58', 32],
    ['80', 48],
  ]) {
    const receipt = buildReceipt(sale(), [longItem], { paperWidth: paper })
    expect(receipt.width).toBe(columns)
    expect(receipt.lines.every((line) => visualLength(line) <= columns)).toBe(
      true,
    )
    const totalRow = receipt.lines.find((line) => line.startsWith('TOTAL'))
    expect(visualLength(totalRow)).toBe(columns)
  }
})

test('wraps a long item name and keeps the amount on the quantity line', () => {
  const { lines } = buildReceipt(sale(), [
    item({
      productName: 'Premium Slim Fit Cotton Casual Shirt With Long Sleeves',
    }),
  ])
  const nameLines = lines.filter((line) => /Premium|Casual|Sleeves/.test(line))
  expect(nameLines.length).toBeGreaterThan(1)
  expect(lines.some((line) => /^ {2}1 x 799\.00 +799\.00$/.test(line))).toBe(
    true,
  )
})

test('prints Marathi shop and item names without breaking letters', () => {
  const marathi = sale({
    shop: {
      name: 'एस जी धोकटे कलेक्शन, जेऊर',
      address: '',
      phone: '',
      taxId: '',
      footer: '',
    },
  })
  const { lines } = buildReceipt(marathi, [item({ productName: 'कॉटन शर्ट' })])
  expect(lines.every((line) => visualLength(line) <= 32)).toBe(true)
  expect(lines.some((line) => /^\s*\p{M}/u.test(line))).toBe(false)
})

test('can print the labels in Marathi', () => {
  const { text } = buildReceipt(sale(), [item()], { language: 'mr' })
  expect(text).toContain('एकूण')
  expect(text).toContain('दिनांक')
  expect(text).toContain('धन्यवाद')
  expect(text).not.toContain('Subtotal')
})

test('marks a reprint as a duplicate copy', () => {
  expect(buildReceipt(sale(), [item()], { reprint: true }).text).toContain(
    'DUPLICATE COPY',
  )
  expect(buildReceipt(sale(), [item()]).text).not.toContain('DUPLICATE COPY')
})

test('only prints discount, added tax, round off and reference when they apply', () => {
  const plain = sale({
    discountPaise: 0,
    taxAddedPaise: 0,
    taxIncludedPaise: 0,
    roundOffPaise: 0,
  })
  const { text } = buildReceipt(plain, [item()])
  for (const missing of [
    'Discount',
    'Round off',
    'Tax added',
    'Includes tax',
    'Ref:',
  ]) {
    expect(text).not.toContain(missing)
  }

  const upi = sale({
    payment: {
      method: 'upi',
      amountTenderedPaise: 71900,
      changePaise: 0,
      reference: 'UPI123',
    },
  })
  expect(buildReceipt(upi, [item()]).text).toContain('Ref: UPI123')
})

test('uses the shop footer or a default thank-you line', () => {
  const custom = sale({
    shop: { ...sale().shop, footer: 'Exchange within 7 days' },
  })
  expect(buildReceipt(custom, [item()]).text).toContain(
    'Exchange within 7 days',
  )
  expect(buildReceipt(sale(), [item()]).text).toContain(
    'Thank you! Visit again.',
  )
})
