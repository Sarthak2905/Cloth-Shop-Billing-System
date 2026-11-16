import { db } from './db'
import { addStockEntries } from './stockEntryRepo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const fabricRow = (over = {}) => ({
  size: 'Grey 101',
  quantity: 2550,
  costPaise: 30000,
  sellingPricePaise: 45000,
  ...over,
})

test('fabric is saved as meters: stock in centimetres and a 3 m low-stock alert', async () => {
  const { entries } = await addStockEntries({
    name: 'Pant Piece',
    category: 'Fabric',
    unit: 'meter',
    rows: [fabricRow()],
  })

  expect(entries[0]).toMatchObject({
    unit: 'meter',
    currentStock: 2550,
    reorderThreshold: 300,
    sellingPricePaise: 45000,
  })
  const movement = (await db.stockMovements.toArray())[0]
  expect(movement).toMatchObject({
    type: 'opening',
    quantityChange: 2550,
    stockAfter: 2550,
  })
})

test('fabric entries of the same name share one product, and the same design can be entered again', async () => {
  const base = { name: 'Pant Piece', category: 'Fabric', unit: 'meter' }
  await addStockEntries({ ...base, rows: [fabricRow()] })
  await addStockEntries({ ...base, rows: [fabricRow({ quantity: 1000 })] })

  expect(await db.products.count()).toBe(1)
  expect(await db.variants.count()).toBe(2)
})

test('a garment and a fabric with the same name are separate products, so their stock is never mixed', async () => {
  const base = { name: 'Cotton', category: 'Cloth' }
  await addStockEntries({
    ...base,
    unit: 'piece',
    rows: [{ size: 'M', quantity: 5, sellingPricePaise: 29900 }],
  })
  await addStockEntries({ ...base, unit: 'meter', rows: [fabricRow()] })
  await addStockEntries({
    ...base,
    unit: 'piece',
    rows: [{ size: 'L', quantity: 3, sellingPricePaise: 29900 }],
  })
  await addStockEntries({
    ...base,
    unit: 'meter',
    rows: [fabricRow({ size: 'Blue' })],
  })

  const products = await db.products.toArray()
  expect(products).toHaveLength(2)
  for (const product of products) {
    const units = new Set(
      (await db.variants.where('productId').equals(product.id).toArray()).map(
        (v) => v.unit,
      ),
    )
    expect(units.size).toBe(1)
  }
})

test('an unknown unit is refused and nothing is saved', async () => {
  await expect(
    addStockEntries({ name: 'Cloth', unit: 'kg', rows: [fabricRow()] }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

  expect(await db.products.count()).toBe(0)
})
