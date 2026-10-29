import { db } from './db'
import { createProduct } from './productRepo'
import { createVariant, generateBarcode, adjustStock } from './variantRepo'
import { searchProducts } from './catalogRepo'
import { seedSampleData } from './sampleData'

const variantInput = (productId, over = {}) => ({
  productId,
  sku: 'SHIRT-M',
  barcode: 'CLO000001',
  size: 'M',
  costPaise: 30000,
  mrpPaise: 79900,
  sellingPricePaise: 69900,
  ...over,
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('generateBarcode', () => {
  test('gives sequential internal codes', async () => {
    expect(await generateBarcode()).toBe('CLO000001')
    expect(await generateBarcode()).toBe('CLO000002')
  })

  test('skips codes that are already used', async () => {
    const p = await createProduct({ name: 'Shirt', category: 'Shirts' })
    await createVariant(variantInput(p.id, { barcode: 'CLO000001' }))
    expect(await generateBarcode()).toBe('CLO000002')
  })
})

describe('sample data', () => {
  test('creates 3 products and 9 variants', async () => {
    const result = await seedSampleData()
    expect(result).toMatchObject({ seeded: true, products: 3, variants: 9 })
    expect(await db.products.count()).toBe(3)
    expect(await db.variants.count()).toBe(9)
  })

  test('does not duplicate when run twice', async () => {
    await seedSampleData()
    const second = await seedSampleData()
    expect(second.seeded).toBe(false)
    expect(await db.products.count()).toBe(3)
  })
})

describe('searchProducts', () => {
  beforeEach(async () => {
    await seedSampleData()
  })

  test('returns all products when the search is empty', async () => {
    expect(await searchProducts('')).toHaveLength(3)
  })

  test('finds by name, ignoring case', async () => {
    const rows = await searchProducts('JEANS')
    expect(rows).toHaveLength(1)
    expect(rows[0].product.name).toBe('Denim Jeans')
  })

  test('finds by SKU', async () => {
    const rows = await searchProducts('SHIRT-M')
    expect(rows).toHaveLength(1)
    expect(rows[0].product.name).toBe('Cotton Shirt')
  })

  test('finds by barcode', async () => {
    const v = (await db.variants.toArray())[0]
    const rows = await searchProducts(v.barcode)
    expect(rows).toHaveLength(1)
    expect(rows[0].product.id).toBe(v.productId)
  })

  test('returns nothing when there is no match', async () => {
    expect(await searchProducts('zzzz-nothing')).toEqual([])
  })
})

describe('stock summary', () => {
  test('flags low stock and totals stock across variants', async () => {
    const p = await createProduct({ name: 'Shirt', category: 'Shirts' })
    const v = await createVariant(
      variantInput(p.id, { openingStock: 2, reorderThreshold: 3 }),
    )
    let [row] = await searchProducts('')
    expect(row.lowStock).toBe(true)
    expect(row.totalStock).toBe(2)

    await adjustStock({ variantId: v.id, quantityChange: 20, type: 'purchase' })
    ;[row] = await searchProducts('')
    expect(row.lowStock).toBe(false)
    expect(row.totalStock).toBe(22)
  })
})
