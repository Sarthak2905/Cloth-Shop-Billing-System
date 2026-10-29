import { db } from '../db/db'
import { createProduct, archiveProduct } from '../db/productRepo'
import { createVariant } from '../db/variantRepo'
import { lookupBarcode, normalizeBarcode } from './scanService'

const variantInput = (productId, over = {}) => ({
  productId,
  sku: 'SHIRT-M',
  barcode: 'CLO000001',
  size: 'M',
  costPaise: 30000,
  mrpPaise: 79900,
  sellingPricePaise: 69900,
  openingStock: 5,
  ...over,
})

async function setup(over = {}) {
  const product = await createProduct({
    name: 'Cotton Shirt',
    category: 'Shirts',
  })
  const variant = await createVariant(variantInput(product.id, over))
  return { product, variant }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('normalizeBarcode trims spaces and removes control characters', () => {
  expect(normalizeBarcode('  CLO000001\r\n')).toBe('CLO000001')
  expect(normalizeBarcode(null)).toBe('')
})

test('finds an active item by barcode', async () => {
  const { variant } = await setup()
  const result = await lookupBarcode('CLO000001')
  expect(result.status).toBe('found')
  expect(result.variant.id).toBe(variant.id)
  expect(result.product.name).toBe('Cotton Shirt')
})

test('finds an item even when the scanner adds a line break', async () => {
  await setup()
  const result = await lookupBarcode('CLO000001\r\n')
  expect(result.status).toBe('found')
})

test('reports not_found for an unknown barcode', async () => {
  await setup()
  const result = await lookupBarcode('CLO999999')
  expect(result.status).toBe('not_found')
  expect(result.message).toContain('CLO999999')
})

test('reports invalid for an empty barcode', async () => {
  const result = await lookupBarcode('   ')
  expect(result.status).toBe('invalid')
})

test('reports invalid for a too-short or badly formatted barcode', async () => {
  expect((await lookupBarcode('AB')).status).toBe('invalid')
  expect((await lookupBarcode('CLO 00!01')).status).toBe('invalid')
})

test('reports archived for an archived product', async () => {
  const { product } = await setup()
  await archiveProduct(product.id)
  const result = await lookupBarcode('CLO000001')
  expect(result.status).toBe('archived')
})

test('still finds an out-of-stock item and exposes its stock', async () => {
  await setup({ openingStock: 0 })
  const result = await lookupBarcode('CLO000001')
  expect(result.status).toBe('found')
  expect(result.variant.currentStock).toBe(0)
})
