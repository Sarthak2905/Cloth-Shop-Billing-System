import { planImport } from './plan'

const HEAD = [
  'Product Name',
  'Category',
  'Brand',
  'Supplier',
  'Size',
  'SKU',
  'Barcode',
  'Cost Price',
  'MRP',
  'Selling Price',
  'Tax %',
  'Price Includes Tax',
  'Opening Stock',
  'Low Stock Alert',
  'Allow Discount',
]
const row = (over = {}) => {
  const merged = {
    'Product Name': "Men's Casual Shirt",
    Category: 'Shirts',
    Size: 'M',
    'Selling Price': 599,
    ...over,
  }
  return HEAD.map((h) => merged[h] ?? '')
}
const NOTHING = { products: [], variants: [] }
const SHIRT = {
  id: 'p1',
  name: "Men's Casual Shirt",
  category: 'Shirts',
  brand: '',
  status: 'active',
}
const SHIRT_M = {
  id: 'v1',
  productId: 'p1',
  size: 'M',
  sku: 'X',
  barcode: 'B1111',
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
  expect(plan.fatal).toContain('Category')
  expect(plan.fatal).toContain('Selling Price')
  expect(plan.ready).toEqual([])
})

test('a row with only the required columns gets sensible defaults', () => {
  const plan = planImport([HEAD, row()], NOTHING)

  expect(plan.fatal).toBeNull()
  expect(plan.ready).toHaveLength(1)
  expect(plan.ready[0].product).toEqual({
    name: "Men's Casual Shirt",
    category: 'Shirts',
    brand: '',
    supplier: '',
  })
  expect(plan.ready[0].variant).toEqual({
    sku: 'MENSCASU-M',
    barcode: null,
    size: 'M',
    costPaise: 0,
    mrpPaise: 59900,
    sellingPricePaise: 59900,
    taxRatePercent: 5,
    priceIncludesTax: true,
    reorderThreshold: 3,
    openingStock: 0,
  })
  expect(plan.ready[0].discountAllowed).toBe(true)
})

test('prices are turned into paise, from numbers and from text like "₹1,299.50"', () => {
  const plan = planImport(
    [
      HEAD,
      row({ 'Cost Price': '₹320', MRP: '1,299.50', 'Selling Price': 599.5 }),
    ],
    NOTHING,
  )
  expect(plan.ready[0].variant).toMatchObject({
    costPaise: 32000,
    mrpPaise: 129950,
    sellingPricePaise: 59950,
  })
})

test('sizes of one product become one product with several items', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Size: 'M' }),
      row({ Size: 'L' }),
      row({ Size: 'XL' }),
      row({ 'Product Name': 'Jeans', Category: 'Jeans' }),
    ],
    NOTHING,
  )
  expect(plan.summary).toMatchObject({
    rowsRead: 4,
    ready: 4,
    newProducts: 2,
    problems: 0,
  })
})

test('numbers, booleans and percentage cells from Excel are understood', () => {
  const plan = planImport(
    [
      HEAD,
      row({
        Size: 32,
        Barcode: 8901234567890,
        'Tax %': 0.05,
        'Price Includes Tax': false,
        'Opening Stock': 7,
      }),
    ],
    NOTHING,
  )
  expect(plan.ready[0].variant).toMatchObject({
    size: '32',
    barcode: '8901234567890',
    taxRatePercent: 5,
    priceIncludesTax: false,
    openingStock: 7,
  })
})

test('every problem is reported with its row number, and good rows still pass', () => {
  const plan = planImport(
    [
      HEAD,
      row({ 'Product Name': '' }),
      row({ Size: 'S', 'Selling Price': 'abc' }),
      row({ Size: 'L', MRP: 799, 'Selling Price': 999 }),
      row({ Size: 'XL', 'Opening Stock': 2.5 }),
      row({ Size: 'XXL', 'Tax %': 150 }),
      row({ Size: '3XL', 'Allow Discount': 'maybe' }),
      row({ Size: '4XL', Barcode: 'bad barcode!' }),
      row({ Size: '5XL' }),
    ],
    NOTHING,
  )

  const byRow = Object.fromEntries(plan.problems.map((p) => [p.row, p.message]))
  expect(byRow[2]).toContain('Product Name is empty')
  expect(byRow[3]).toContain('Selling Price must be a number')
  expect(byRow[4]).toContain('Selling Price (999.00) is more than MRP (799.00)')
  expect(byRow[5]).toContain('Opening Stock must be a whole number')
  expect(byRow[6]).toContain('Tax % must be')
  expect(byRow[7]).toContain('Allow Discount must be Yes or No')
  expect(byRow[8]).toContain('Barcode may only contain')
  expect(plan.ready).toHaveLength(1)
  expect(plan.ready[0].row).toBe(9)
})

test('blank rows are ignored and row numbers match the sheet', () => {
  const plan = planImport(
    [[], HEAD, [], row(), ['', ''], row({ Size: 'L', 'Selling Price': 'x' })],
    NOTHING,
  )
  expect(plan.ready[0].row).toBe(4)
  expect(plan.problems[0].row).toBe(6)
  expect(plan.summary.rowsRead).toBe(2)
})

test('a size of "-" is accepted, and a date in a text column is explained', () => {
  const plan = planImport(
    [HEAD, row({ Size: '-' }), row({ Size: new Date('2026-02-03') })],
    NOTHING,
  )
  expect(plan.ready).toHaveLength(1)
  expect(plan.ready[0].variant.size).toBe('-')
  expect(plan.problems[0].message).toContain('looks like a date')
})

test('repeats inside the file are caught', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Size: 'M', Barcode: 'CLO111111', SKU: 'SKU-1' }),
      row({ Size: 'm' }),
      row({ Size: 'L', Barcode: 'CLO111111' }),
      row({ Size: 'XL', SKU: 'SKU-1' }),
    ],
    NOTHING,
  )
  const byRow = Object.fromEntries(plan.problems.map((p) => [p.row, p.message]))
  expect(byRow[3]).toContain('Same product and size as row 2')
  expect(byRow[4]).toContain('Same barcode as row 2')
  expect(byRow[5]).toContain('Same SKU as row 2')
  expect(plan.ready).toHaveLength(1)
})

test('items already in the app are skipped, not reported as problems', () => {
  const plan = planImport([HEAD, row({ Size: 'm' })], {
    products: [SHIRT],
    variants: [SHIRT_M],
  })

  expect(plan.skippedExisting).toEqual([
    { row: 2, name: "Men's Casual Shirt", size: 'm' },
  ])
  expect(plan.ready).toEqual([])
  expect(plan.problems).toEqual([])
})

test('a barcode or SKU used by another item is a problem that names the owner', () => {
  const plan = planImport(
    [
      HEAD,
      row({ 'Product Name': 'Tee', Barcode: 'B1111' }),
      row({ 'Product Name': 'Cap', SKU: 'X' }),
    ],
    { products: [SHIRT], variants: [SHIRT_M] },
  )
  expect(plan.problems[0].message).toContain(
    'Barcode B1111 is already used by X',
  )
  expect(plan.problems[1].message).toContain('SKU "X" is already used')
})

test('a new size for an existing product is added to that product', () => {
  const plan = planImport([HEAD, row({ Size: 'L' })], {
    products: [SHIRT],
    variants: [SHIRT_M],
  })

  expect(plan.ready[0].existingProductId).toBe('p1')
  expect(plan.summary).toMatchObject({
    ready: 1,
    newProducts: 0,
    addedToExisting: 1,
  })
})

test('an archived product is a problem, not silently reused', () => {
  const plan = planImport([HEAD, row({ Size: 'L' })], {
    products: [{ ...SHIRT, status: 'archived' }],
    variants: [SHIRT_M],
  })
  expect(plan.problems[0].message).toContain('archived')
})

test('SKUs are made unique, also for Marathi names', () => {
  const plan = planImport(
    [
      HEAD,
      row({ 'Product Name': 'कॉटन शर्ट' }),
      row({ 'Product Name': 'पँट' }),
      row(),
    ],
    NOTHING,
  )
  expect(plan.ready.map((r) => r.variant.sku)).toEqual([
    'ITEM-M',
    'ITEM-M-2',
    'MENSCASU-M',
  ])
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
