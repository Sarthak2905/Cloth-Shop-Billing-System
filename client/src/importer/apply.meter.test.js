import { db } from '../db/db'
import { applyImport } from './apply'
import { planImport } from './plan'

const HEAD = [
  'Product Name',
  'Size',
  'Quantity',
  'Cost',
  'Selling Price',
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
const plan = (rows, existing = { products: [], variants: [] }) =>
  planImport([HEAD, ...rows], existing)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('a fabric row is saved with its unit, centimetre stock and a 3 m low-stock alert', async () => {
  const result = await applyImport(plan([row()]))

  const [variant] = await db.variants.toArray()
  expect(variant).toMatchObject({
    unit: 'meter',
    currentStock: 2550,
    reorderThreshold: 300,
    sellingPricePaise: 45000,
    barcode: 'CLO000001',
  })
  const movement = (await db.stockMovements.toArray())[0]
  expect(movement).toMatchObject({ type: 'opening', quantityChange: 2550 })
  expect(result.entries[0]).toMatchObject({ stock: 2550, unit: 'meter' })
})

test('a fabric and a garment with the same name are saved as two products', async () => {
  await applyImport(
    plan([
      row({ 'Product Name': 'Cloth' }),
      row({ 'Product Name': 'Cloth', Size: 'M', Quantity: 4, Unit: 'Piece' }),
    ]),
  )

  expect(await db.products.count()).toBe(2)
  const variants = await db.variants.toArray()
  expect(variants.map((v) => v.unit).sort()).toEqual(['meter', 'piece'])
  expect(variants.find((v) => v.unit === 'piece').reorderThreshold).toBe(3)
})

test('a later import of the same fabric adds entries to the same product', async () => {
  await applyImport(plan([row()]))
  const existing = {
    products: await db.products.toArray(),
    variants: await db.variants.toArray(),
  }

  const result = await applyImport(plan([row({ Quantity: '10' })], existing))

  expect(result).toMatchObject({
    productsCreated: 0,
    entriesCreated: 1,
    addedToExisting: 1,
  })
  expect(await db.products.count()).toBe(1)
  expect(await db.variants.count()).toBe(2)
})
