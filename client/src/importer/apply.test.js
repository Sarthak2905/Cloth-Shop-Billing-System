import { db } from '../db/db'
import { createProduct } from '../db/productRepo'
import { createVariant, generateBarcode } from '../db/variantRepo'
import { collectPending } from '../sync/collect'
import { applyImport } from './apply'
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
const plan = (rows, existing = { products: [], variants: [] }) =>
  planImport([HEAD, ...rows], existing)

const variantData = (productId, over = {}) => ({
  productId,
  size: 'M',
  sku: 'SKU-X',
  barcode: 'BC-0001',
  costPaise: 0,
  mrpPaise: 59900,
  sellingPricePaise: 59900,
  taxRatePercent: 5,
  priceIncludesTax: true,
  openingStock: 0,
  reorderThreshold: 3,
  ...over,
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('saves products, items and opening stock records together', async () => {
  const result = await applyImport(
    plan([
      row({ Size: 'M', 'Opening Stock': 10 }),
      row({ Size: 'L', 'Opening Stock': 0 }),
      row({ 'Product Name': 'Denim Jeans', Category: 'Jeans', Size: '32', 'Opening Stock': 5, 'Allow Discount': 'No' }),
    ]),
  )

  expect(result).toMatchObject({ productsCreated: 2, variantsCreated: 3, barcodesGenerated: 3 })
  expect(await db.products.count()).toBe(2)
  expect(await db.variants.count()).toBe(3)
  expect(await db.stockMovements.count()).toBe(2) // none for the item with no stock

  const products = await db.products.toArray()
  const jeans = products.find((p) => p.name === 'Denim Jeans')
  const shirt = products.find((p) => p.name === "Men's Casual Shirt")
  expect(jeans.discountAllowed).toBe(false)
  expect(shirt.discountAllowed).toBe(true)

  const shirtM = (await db.variants.toArray()).find((v) => v.size === 'M')
  expect(shirtM.currentStock).toBe(10)
  const movements = await db.stockMovements.toArray()
  const movement = movements.find((m) => m.variantId === shirtM.id)
  expect(movement).toMatchObject({ type: 'opening', quantityChange: 10, stockAfter: 10 })
})


test('internal barcodes are created in order, skip used ones, and the counter moves on', async () => {
  const result = await applyImport(
    plan([
      row({ Size: 'S' }),
      row({ Size: 'M', Barcode: 'CLO000002' }),
      row({ Size: 'L' }),
    ]),
  )

  const barcodes = (await db.variants.toArray()).map((v) => v.barcode).sort()
  expect(barcodes).toEqual(['CLO000001', 'CLO000002', 'CLO000003'])
  expect(result.barcodesGenerated).toBe(2)
  expect(await generateBarcode()).toBe('CLO000004')
})

test('a new size is added to an existing product without creating a second product', async () => {
  const product = await createProduct({
    name: "Men's Casual Shirt",
    category: 'Shirts',
  })
  await createVariant(
    variantData(product.id, { size: 'M', sku: 'OLD-M', barcode: 'BC-0001' }),
  )
  const existing = {
    products: await db.products.toArray(),
    variants: await db.variants.toArray(),
  }

  const result = await applyImport(plan([row({ Size: 'L' })], existing))

  expect(result).toMatchObject({
    productsCreated: 0,
    variantsCreated: 1,
    addedToExisting: 1,
  })
  expect(await db.products.count()).toBe(1)
  expect(await db.variants.where('productId').equals(product.id).count()).toBe(
    2,
  )
})

test('if saving fails, nothing at all is saved', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const checked = plan([row({ Size: 'M', Barcode: 'BC-1234', SKU: 'SKU-A' })])

  // Someone uses the same barcode after the file was checked.
  const other = await createProduct({ name: 'Other', category: 'Misc' })
  await createVariant(
    variantData(other.id, { sku: 'SKU-B', barcode: 'BC-1234' }),
  )

  await expect(applyImport(checked)).rejects.toMatchObject({
    code: 'IMPORT_FAILED',
  })

  expect(await db.products.count()).toBe(1)
  expect(await db.variants.count()).toBe(1)
  spy.mockRestore()
})

test('imported items are picked up by the sync queue', async () => {
  await applyImport(
    plan([
      row({ Size: 'M', 'Opening Stock': 4 }),
      row({ Size: 'L', 'Opening Stock': 6 }),
    ]),
  )

  const ops = await collectPending()
  const count = (type) => ops.filter((op) => op.type === type).length

  expect(count('product.upsert')).toBe(1)
  expect(count('variant.upsert')).toBe(2)
  expect(count('stock.movement')).toBe(2)
})
