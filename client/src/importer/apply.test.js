import { db } from '../db/db'
import { createProduct } from '../db/productRepo'
import { addStockEntries } from '../db/stockEntryRepo'
import { createVariant, generateBarcode } from '../db/variantRepo'
import { collectPending } from '../sync/collect'
import { applyImport } from './apply'
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
const plan = (rows, existing = { products: [] }) =>
  planImport([HEAD, ...rows], existing)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('saves products, entries and stock records together, each entry with its own barcode', async () => {
  const result = await applyImport(
    plan([
      row({ Size: 'M', Quantity: 10 }),
      row({ Size: 'M', Quantity: 6, Cost: 330, 'Selling Price': 629 }),
      row({
        'Product Name': 'Denim Jeans',
        Category: 'Jeans',
        Size: '32',
        Quantity: 5,
        'Allow Discount': 'No',
      }),
    ]),
  )

  expect(result).toMatchObject({
    productsCreated: 2,
    entriesCreated: 3,
    addedToExisting: 0,
  })
  expect(result.entries).toHaveLength(3)
  expect(await db.products.count()).toBe(2)
  expect(await db.stockMovements.count()).toBe(3)

  const variants = (await db.variants.toArray()).sort((a, b) =>
    a.barcode.localeCompare(b.barcode),
  )
  expect(variants.map((v) => v.barcode)).toEqual([
    'CLO000001',
    'CLO000002',
    'CLO000003',
  ])
  expect(variants.map((v) => v.sku)).toEqual([
    'CLO000001',
    'CLO000002',
    'CLO000003',
  ])
  expect(variants.map((v) => v.currentStock)).toEqual([10, 6, 5])
  expect(variants[1].sellingPricePaise).toBe(62900)

  const products = await db.products.toArray()
  expect(products.find((p) => p.name === 'Denim Jeans').discountAllowed).toBe(
    false,
  )
  expect(
    products.find((p) => p.name === "Men's Casual Shirt").discountAllowed,
  ).toBe(true)
  const movement = (await db.stockMovements.toArray())[0]
  expect(movement).toMatchObject({
    type: 'opening',
    reason: 'Stock entry (import)',
  })
})

test('barcodes skip numbers already used, and the counter moves on', async () => {
  const product = await createProduct({ name: 'Old' })
  await createVariant({
    productId: product.id,
    size: 'M',
    barcode: 'CLO000002',
    costPaise: 0,
    mrpPaise: 100,
    sellingPricePaise: 100,
    openingStock: 1,
  })

  await applyImport(plan([row({ Size: 'S' }), row({ Size: 'L' })]))

  const barcodes = (await db.variants.toArray()).map((v) => v.barcode).sort()
  expect(barcodes).toEqual(['CLO000001', 'CLO000002', 'CLO000003'])
  expect(await generateBarcode()).toBe('CLO000004')
})

test('a new entry for an existing product is added to that product, not to a second one', async () => {
  await addStockEntries({
    name: "Men's Casual Shirt",
    rows: [{ size: 'M', quantity: 1, sellingPricePaise: 100 }],
  })
  const existing = { products: await db.products.toArray() }

  const result = await applyImport(plan([row({ Size: 'M' })], existing))

  expect(result).toMatchObject({
    productsCreated: 0,
    entriesCreated: 1,
    addedToExisting: 1,
  })
  expect(await db.products.count()).toBe(1)
  expect(await db.variants.count()).toBe(2)
})

test('importing the same rows twice adds the stock twice (duplicates are allowed)', async () => {
  const rows = [
    row({ Size: 'M', Quantity: 10 }),
    row({ Size: 'L', Quantity: 5 }),
  ]

  await applyImport(plan(rows))
  await applyImport(plan(rows, { products: await db.products.toArray() }))

  expect(await db.products.count()).toBe(1)
  const variants = await db.variants.toArray()
  expect(variants).toHaveLength(4)
  expect(variants.reduce((total, v) => total + v.currentStock, 0)).toBe(30)
})

test('if saving fails halfway, nothing at all is saved', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const checked = plan([row({ 'Product Name': 'Shirt A' })])
  // a second entry that points at a product which does not exist
  checked.ready.push({
    ...checked.ready[0],
    key: 'ghost',
    existingProductId: 'missing',
    product: { name: 'Ghost', category: '', brand: '' },
  })

  await expect(applyImport(checked)).rejects.toMatchObject({
    code: 'IMPORT_FAILED',
  })

  expect(await db.products.count()).toBe(0)
  expect(await db.variants.count()).toBe(0)
  expect(await db.stockMovements.count()).toBe(0)
  expect(await db.settings.get('barcodeCounter')).toBeUndefined()
  spy.mockRestore()
})

test('imported entries are picked up by the sync queue', async () => {
  await applyImport(
    plan([row({ Size: 'M', Quantity: 4 }), row({ Size: 'L', Quantity: 6 })]),
  )

  const ops = await collectPending()
  const count = (type) => ops.filter((op) => op.type === type).length

  expect(count('product.upsert')).toBe(1)
  expect(count('variant.upsert')).toBe(2)
  expect(count('stock.movement')).toBe(2)
})
