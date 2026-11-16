import { buildReceipt } from './receiptBuilder'

const sale = (over = {}) => ({
  invoiceNumber: 'INV-000001',
  createdAt: '2026-10-29T10:45:00.000Z',
  shop: {
    name: 'Sarthak Fashions',
    address: 'Main Road, Baramati\nPune 413102',
    phone: '9876543210',
    taxId: '27ABCDE1234F1Z5',
    footer: '',
  },
  itemCount: 1,
  subtotalPaise: 79900,
  discountPaise: 7990,
  billDiscountPaise: 7990,
  taxAddedPaise: 0,
  taxIncludedPaise: 3424,
  taxPaise: 3424,
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
  unit: 'piece',
  unitPricePaise: 79900,
  grossPaise: 79900,
  lineDiscountPaise: 0,
  ...over,
})

test('prints the shop, invoice, items, totals and tax, and no payment lines', () => {
  const { text } = buildReceipt(sale(), [item()], { paperWidth: '80-42' })

  for (const expected of [
    'Sarthak Fashions',
    'Main Road, Baramati',
    'Pune 413102',
    'Ph: 9876543210',
    'GSTIN: 27ABCDE1234F1Z5',
    'Invoice:',
    'INV-000001',
    'Cotton Shirt (M)',
    '1 x 799.00',
    'Subtotal (1)',
    '-79.90',
    'After discount',
    'Round off',
    '-0.10',
    'TOTAL',
    '719.00',
    'Includes tax',
    '34.24',
    'Thank you! Visit again.',
  ]) {
    expect(text).toContain(expected)
  }
  for (const missing of ['Payment', 'Received', 'Change', 'Cash']) {
    expect(text).not.toContain(missing)
  }
})

test('the text is exactly what a pending bill prints too', () => {
  const pending = sale({
    paymentStatus: 'pending',
    payment: {
      method: 'pending',
      amountTenderedPaise: 0,
      changePaise: 0,
      reference: '',
    },
  })

  expect(buildReceipt(pending, [item()]).text).toBe(
    buildReceipt(sale(), [item()]).text,
  )
})

test('the Marathi labels are used when asked, with no payment lines', () => {
  const { text } = buildReceipt(sale(), [item()], {
    paperWidth: '80',
    language: 'mr',
  })

  for (const expected of [
    'बिल क्र.',
    'उप-एकूण',
    'सूटनंतर',
    'एकूणात कर',
    'धन्यवाद! पुन्हा भेट द्या.',
  ]) {
    expect(text).toContain(expected)
  }
  for (const missing of ['भरणा', 'मिळालेले', 'रोख', 'Subtotal']) {
    expect(text).not.toContain(missing)
  }
})

test('no line is longer than the paper, and long names wrap', () => {
  const long = item({
    productName: 'A very long product name that needs to wrap onto more lines',
  })

  for (const [paperWidth, width] of [
    ['58', 32],
    ['80', 48],
    ['80-42', 42],
  ]) {
    const receipt = buildReceipt(sale(), [long], { paperWidth })
    expect(receipt.width).toBe(width)
    expect(receipt.lines.every((line) => line.length <= width)).toBe(true)
  }
  expect(
    buildReceipt(sale(), [long], { paperWidth: '58' }).lines.join('\n'),
  ).toContain('wrap')
})

test('an unknown paper width falls back to 58 mm, and the receipt asks for a cut', () => {
  const receipt = buildReceipt(sale(), [item()], { paperWidth: 'xx' })

  expect(receipt).toMatchObject({ paperWidth: '58', width: 32, cut: true })
  expect(receipt.text).toBe(receipt.lines.join('\n'))
})

test('a reprint carries the duplicate line and a first print does not', () => {
  expect(buildReceipt(sale(), [item()], { reprint: true }).text).toContain(
    '*** DUPLICATE COPY ***',
  )
  expect(buildReceipt(sale(), [item()]).text).not.toContain('DUPLICATE')
})

test('a bill without a bill discount or tax stays plain', () => {
  const plain = sale({
    billDiscountPaise: 0,
    discountPaise: 0,
    taxIncludedPaise: 0,
    taxPaise: 0,
    roundOffPaise: 0,
    totalPaise: 79900,
  })
  const { text } = buildReceipt(plain, [item()])

  expect(text).toContain('Subtotal (1)')
  expect(text).toContain('799.00')
  for (const missing of [
    'Discount',
    'After discount',
    'Includes tax',
    'Round off',
  ]) {
    expect(text).not.toContain(missing)
  }
})

test('an item discount is shown under its item', () => {
  const plain = sale({
    billDiscountPaise: 0,
    discountPaise: 5000,
    totalPaise: 74900,
    roundOffPaise: 0,
  })
  const { text } = buildReceipt(plain, [item({ lineDiscountPaise: 5000 })])

  expect(text).toContain('Item discount')
  expect(text).toContain('-50.00')
})

test('a size of "-" is not printed, and fabric shows its length', () => {
  const { text } = buildReceipt(
    sale({
      billDiscountPaise: 0,
      discountPaise: 0,
      roundOffPaise: 0,
      taxIncludedPaise: 0,
    }),
    [
      item({
        productName: 'Astar',
        size: '-',
        unit: 'meter',
        quantity: 235,
        unitPricePaise: 3500,
        grossPaise: 8225,
      }),
    ],
  )

  expect(text).not.toContain('(-)')
  expect(text).toContain('2.35 m x 35.00')
})
