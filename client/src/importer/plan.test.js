import { planImport } from './plan'

const HEAD = [
  'Product Name',
  'Size',
  'Quantity',
  'Cost',
  'Selling Price',
  'Company',
  'Category',
  'MRP',
  'Tax %',
  'Price Includes Tax',
  'Allow Discount',
]
const row = (over = {}) => {
  const merged = {
    'Product Name': "Men's Casual Shirt",
    Size: 'M',
    Quantity: 10,
    'Selling Price': 599,
    ...over,
  }
  return HEAD.map((h) => merged[h] ?? '')
}
const NOTHING = { products: [] }
const SHIRT = {
  id: 'p1',
  name: "Men's Casual Shirt",
  category: '',
  brand: '',
  status: 'active',
}

test('an empty file and a file without the required columns are refused', () => {
  expect(planImport([], NOTHING).fatal).toMatch(/empty/i)
  expect(planImport([[], ['']], NOTHING).fatal).toMatch(/empty/i)

  const plan = planImport(
    [
      ['Product Name', 'Size'],
      ['Shirt', 'M'],
    ],
    NOTHING,
  )
  expect(plan.fatal).toContain('Quantity')
  expect(plan.fatal).toContain('Selling Price')
  expect(plan.ready).toEqual([])
})

test('a row with only the required columns gets sensible defaults', () => {
  const plan = planImport([HEAD, row()], NOTHING)

  expect(plan.fatal).toBeNull()
  expect(plan.ready).toHaveLength(1)
  expect(plan.ready[0].product).toEqual({
    name: "Men's Casual Shirt",
    category: '',
    brand: '',
  })
  expect(plan.ready[0].variant).toEqual({
    size: 'M',
    quantity: 10,
    costPaise: 0,
    mrpPaise: 59900,
    sellingPricePaise: 59900,
    taxRatePercent: 5,
    priceIncludesTax: true,
  })
  expect(plan.ready[0].discountAllowed).toBe(true)
})

test('prices are turned into paise, from numbers and from text like "₹1,299.50"', () => {
  const plan = planImport(
    [HEAD, row({ Cost: '₹320', MRP: '1,299.50', 'Selling Price': 599.5 })],
    NOTHING,
  )

  expect(plan.ready[0].variant).toMatchObject({
    costPaise: 32000,
    mrpPaise: 129950,
    sellingPricePaise: 59950,
  })
})

test('a selling price above the MRP is fine', () => {
  const plan = planImport(
    [HEAD, row({ MRP: 500, 'Selling Price': 599 })],
    NOTHING,
  )

  expect(plan.problems).toEqual([])
  expect(plan.ready[0].variant).toMatchObject({
    mrpPaise: 50000,
    sellingPricePaise: 59900,
  })
})

test('the same product and size in many rows are all accepted, each as its own entry', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Quantity: 10 }),
      row({ Quantity: 6, 'Selling Price': 629 }),
      row({ Quantity: 4 }),
    ],
    NOTHING,
  )

  expect(plan.problems).toEqual([])
  expect(plan.ready).toHaveLength(3)
  expect(plan.summary).toMatchObject({ ready: 3, pieces: 20, newProducts: 1 })
})

test('any size text is accepted, even an empty one, and a date in the size column is explained', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Size: '2-3 years' }),
      row({ Size: 'Free size' }),
      row({ Size: '' }),
      row({ Size: 28 }),
      row({ Size: new Date('2026-02-03') }),
    ],
    NOTHING,
  )

  expect(plan.ready.map((r) => r.variant.size)).toEqual([
    '2-3 years',
    'Free size',
    '',
    '28',
  ])
  expect(plan.problems).toHaveLength(1)
  expect(plan.problems[0].message).toContain('looks like a date')
})

test('numbers, booleans and percentage cells from Excel are understood', () => {
  const plan = planImport(
    [HEAD, row({ Quantity: 7, 'Tax %': 0.05, 'Price Includes Tax': false })],
    NOTHING,
  )

  expect(plan.ready[0].variant).toMatchObject({
    quantity: 7,
    taxRatePercent: 5,
    priceIncludesTax: false,
  })
})

test('every problem is reported with its row number, and good rows still pass', () => {
  const plan = planImport(
    [
      HEAD,
      row({ 'Product Name': '' }),
      row({ Quantity: '' }),
      row({ Quantity: 0 }),
      row({ Quantity: 2.5 }),
      row({ 'Selling Price': 'abc' }),
      row({ Cost: 'abc' }),
      row({ 'Tax %': 150 }),
      row({ 'Allow Discount': 'maybe' }),
      row(),
    ],
    NOTHING,
  )

  const byRow = Object.fromEntries(plan.problems.map((p) => [p.row, p.message]))
  expect(byRow[2]).toContain('Product Name is empty')
  expect(byRow[3]).toContain('Quantity is empty')
  expect(byRow[4]).toContain('Quantity must be a whole number, 1 or more')
  expect(byRow[5]).toContain('Quantity must be a whole number, 1 or more')
  expect(byRow[6]).toContain('Selling Price must be a number')
  expect(byRow[7]).toContain('Cost must be a number')
  expect(byRow[8]).toContain('Tax % must be')
  expect(byRow[9]).toContain('Allow Discount must be Yes or No')
  expect(plan.ready).toHaveLength(1)
  expect(plan.ready[0].row).toBe(10)
})

test('blank rows are ignored and row numbers match the sheet', () => {
  const plan = planImport(
    [[], HEAD, [], row(), ['', ''], row({ 'Selling Price': 'x' })],
    NOTHING,
  )

  expect(plan.ready[0].row).toBe(4)
  expect(plan.problems[0].row).toBe(6)
  expect(plan.summary.rowsRead).toBe(2)
})

test('an existing active product with the same name, company and category is reused', () => {
  const plan = planImport(
    [HEAD, row({ 'Product Name': "  men's   casual SHIRT " })],
    { products: [SHIRT] },
  )

  expect(plan.ready[0].existingProductId).toBe('p1')
  expect(plan.summary).toMatchObject({ newProducts: 0, addedToExisting: 1 })
})

test('a different company makes a new product, and an archived product is not reused', () => {
  const other = planImport([HEAD, row({ Company: 'Hero' })], {
    products: [SHIRT],
  })
  expect(other.ready[0].existingProductId).toBeNull()
  expect(other.summary.newProducts).toBe(1)

  const archived = planImport([HEAD, row()], {
    products: [{ ...SHIRT, status: 'archived' }],
  })
  expect(archived.ready[0].existingProductId).toBeNull()
})

test('SKU and Barcode columns are ignored, not used', () => {
  const plan = planImport(
    [
      ['Product Name', 'Quantity', 'Selling Price', 'SKU', 'Barcode'],
      ['Shirt', 5, 599, 'X-1', 'CLO000001'],
    ],
    NOTHING,
  )

  expect(plan.ignoredColumns).toEqual(['SKU', 'Barcode'])
  expect(plan.ready).toHaveLength(1)
  expect(plan.ready[0].variant).not.toHaveProperty('sku')
  expect(plan.ready[0].variant).not.toHaveProperty('barcode')
})

test('Allow Discount is read for each row', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Size: 'M', 'Allow Discount': 'Yes' }),
      row({ Size: 'L', 'Allow Discount': 'No' }),
    ],
    NOTHING,
  )

  expect(plan.ready.map((r) => r.discountAllowed)).toEqual([true, false])
})

test('the summary counts the pieces', () => {
  const plan = planImport(
    [HEAD, row({ Quantity: 10 }), row({ Quantity: 6 })],
    NOTHING,
  )

  expect(plan.summary).toMatchObject({
    rowsRead: 2,
    ready: 2,
    pieces: 16,
    problems: 0,
  })
})

test('a file with too many rows is refused', () => {
  const plan = planImport(
    [HEAD, ...Array.from({ length: 5001 }, () => row())],
    NOTHING,
  )

  expect(plan.fatal).toMatch(/5,000/)
})
