import { planImport } from './plan'

const HEAD = [
  'Product Name',
  'Size',
  'Quantity',
  'Cost',
  'Selling Price',
  'Category',
  'Unit',
]
const row = (over = {}) => {
  const merged = {
    'Product Name': 'Pant Piece',
    Size: 'Grey 101',
    Quantity: '25.5',
    'Selling Price': 450,
    Unit: 'Meter',
    ...over,
  }
  return HEAD.map((h) => merged[h] ?? '')
}
const NOTHING = { products: [], variants: [] }

test('a Meter row keeps its quantity as whole centimetres, and an empty Unit means Piece', () => {
  const plan = planImport(
    [HEAD, row(), row({ 'Product Name': 'Shirt', Quantity: 10, Unit: '' })],
    NOTHING,
  )

  expect(plan.problems).toEqual([])
  expect(plan.ready[0].variant).toMatchObject({
    unit: 'meter',
    quantity: 2550,
    sellingPricePaise: 45000,
  })
  expect(plan.ready[1].variant).toMatchObject({ unit: 'piece', quantity: 10 })
})

test('meters are read from Excel numbers and from text', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Quantity: 25.5 }),
      row({ Size: 'B', Quantity: '10' }),
      row({ Size: 'C', Quantity: 0.25 }),
    ],
    NOTHING,
  )

  expect(plan.ready.map((r) => r.variant.quantity)).toEqual([2550, 1000, 25])
})

test('a wrong fabric quantity is explained', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Quantity: 'abc' }),
      row({ Quantity: 0 }),
      row({ Quantity: '2.555' }),
    ],
    NOTHING,
  )

  expect(plan.ready).toEqual([])
  expect(plan.problems.map((p) => p.message)).toEqual([
    'Quantity must be meters like 25 or 25.5',
    'Quantity must be meters like 25 or 25.5',
    'Quantity must be meters like 25 or 25.5',
  ])
})

test('Unit accepts several spellings and refuses anything else', () => {
  const ok = planImport(
    [
      HEAD,
      row({ Unit: 'Meters' }),
      row({ Size: 'B', Unit: 'mtr' }),
      row({ Size: 'C', Unit: 'Pcs', Quantity: 3 }),
      row({ Size: 'D', Unit: 'Centimetres', Quantity: 90 }),
    ],
    NOTHING,
  )
  expect(ok.ready.map((r) => r.variant.unit)).toEqual([
    'meter',
    'meter',
    'piece',
    'meter',
  ])

  const bad = planImport([HEAD, row({ Unit: 'kg' })], NOTHING)
  expect(bad.problems[0].message).toContain('Unit must be Piece, Meter or CM')
})

test('Unit CM means the quantity is in centimetres and the price stays per meter', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Unit: 'CM', Quantity: 2550 }),
      row({ Size: 'B', Unit: 'cm', Quantity: '80' }),
    ],
    NOTHING,
  )

  expect(plan.problems).toEqual([])
  expect(plan.ready.map((r) => r.variant)).toEqual([
    expect.objectContaining({
      unit: 'meter',
      quantity: 2550,
      sellingPricePaise: 45000,
    }),
    expect.objectContaining({
      unit: 'meter',
      quantity: 80,
      sellingPricePaise: 45000,
    }),
  ])
})

test('with Unit CM the quantity must be whole centimetres', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Unit: 'CM', Quantity: 82.5 }),
      row({ Unit: 'CM', Quantity: 0 }),
    ],
    NOTHING,
  )

  expect(plan.ready).toEqual([])
  expect(plan.problems.map((p) => p.message)).toEqual([
    'Quantity must be whole centimetres like 80',
    'Quantity must be whole centimetres like 80',
  ])
})

test('a quantity can carry its own unit, like "80 cm" or "2.5 m"', () => {
  const plan = planImport(
    [
      HEAD,
      row({ Quantity: '80 cm' }),
      row({ Size: 'B', Quantity: '2.5 m' }),
      row({ Size: 'C', Unit: 'CM', Quantity: '1.2 m' }),
    ],
    NOTHING,
  )

  expect(plan.problems).toEqual([])
  expect(plan.ready.map((r) => r.variant.quantity)).toEqual([80, 250, 120])
})

test('the summary counts pieces and meters separately', () => {
  const plan = planImport(
    [
      HEAD,
      row(),
      row({ Size: 'B', Quantity: 10 }),
      row({ 'Product Name': 'Shirt', Quantity: 7, Unit: 'Piece' }),
    ],
    NOTHING,
  )

  expect(plan.summary).toMatchObject({
    ready: 3,
    pieces: 7,
    meters: 3550,
    newProducts: 2,
  })
})

test('a fabric and a garment with the same name are two products, and an existing fabric is reused', () => {
  const same = planImport(
    [
      HEAD,
      row({ 'Product Name': 'Cloth' }),
      row({ 'Product Name': 'Cloth', Size: 'M', Quantity: 4, Unit: 'Piece' }),
    ],
    NOTHING,
  )
  expect(same.summary.newProducts).toBe(2)

  const existing = {
    products: [
      {
        id: 'p9',
        name: 'Pant Piece',
        category: '',
        brand: '',
        status: 'active',
      },
    ],
    variants: [{ productId: 'p9', unit: 'meter' }],
  }
  const reused = planImport([HEAD, row()], existing)
  expect(reused.ready[0].existingProductId).toBe('p9')

  const asPiece = planImport(
    [HEAD, row({ Unit: 'Piece', Quantity: 3 })],
    existing,
  )
  expect(asPiece.ready[0].existingProductId).toBeNull()
})
