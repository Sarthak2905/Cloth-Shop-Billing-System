import { db } from './db'
import { createProduct } from './productRepo'
import { createVariant } from './variantRepo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const input = (productId, over = {}) => ({
  productId,
  size: 'M',
  sku: 'SHIRT-BLU-M',
  costPaise: 30000,
  mrpPaise: 79900,
  sellingPricePaise: 69900,
  taxRatePercent: 5,
  priceIncludesTax: true,
  openingStock: 0,
  reorderThreshold: 0,
  ...over,
})

test('the same SKU can be used on more than one item', async () => {
  const product = await createProduct({ name: 'Shirt' })

  await createVariant(input(product.id, { size: 'M' }))
  await createVariant(input(product.id, { size: 'L' }))

  expect(await db.variants.count()).toBe(2)
})

test('the same product and size can be entered twice, each with its own barcode', async () => {
  const product = await createProduct({ name: 'Shirt' })

  const first = await createVariant(input(product.id, { sku: 'A' }))
  const second = await createVariant(input(product.id, { sku: 'B' }))

  expect(first.size).toBe('M')
  expect(second.size).toBe('M')
  expect(first.barcode).not.toBe(second.barcode)
  expect(await db.variants.count()).toBe(2)
})

test('the selling price may be above the MRP', async () => {
  const product = await createProduct({ name: 'Shirt' })

  const variant = await createVariant(
    input(product.id, { sellingPricePaise: 90000 }),
  )

  expect(variant.sellingPricePaise).toBe(90000)
  expect(variant.mrpPaise).toBe(79900)
})
