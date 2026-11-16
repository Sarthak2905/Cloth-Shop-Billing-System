import { db } from './db'
import { createProduct } from './productRepo'
import { addStockEntries } from './stockEntryRepo'
import { createVariant, generateBarcode } from './variantRepo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const row = (over = {}) => ({
  size: 'M',
  quantity: 10,
  costPaise: 32000,
  sellingPricePaise: 59900,
  ...over,
})

test('the same product and size can be entered again and again', async () => {
  for (let i = 0; i < 3; i += 1) {
    await addStockEntries({
      name: "Men's Shirt",
      category: 'Shirts',
      rows: [row()],
    })
  }

  expect(await db.products.count()).toBe(1)
  const variants = await db.variants.toArray()
  expect(variants).toHaveLength(3)
  expect(new Set(variants.map((v) => v.barcode)).size).toBe(3)
  expect(variants.every((v) => v.size === 'M' && v.currentStock === 10)).toBe(
    true,
  )
})

test('every entry gets the next barcode automatically, and the hidden SKU equals it', async () => {
  const { entries } = await addStockEntries({
    name: 'Tee',
    rows: [row({ size: 'S' }), row({ size: 'M' }), row({ size: 'L' })],
  })

  expect(entries.map((e) => e.barcode)).toEqual([
    'CLO000001',
    'CLO000002',
    'CLO000003',
  ])
  expect(entries.map((e) => e.sku)).toEqual([
    'CLO000001',
    'CLO000002',
    'CLO000003',
  ])
  expect(await generateBarcode()).toBe('CLO000004')
})

test('entries of the same name, category and company share one product, ignoring capitals and spaces', async () => {
  await addStockEntries({
    name: 'Cotton Shirt',
    category: 'Shirts',
    brand: 'Hero',
    rows: [row()],
  })
  await addStockEntries({
    name: '  cotton   shirt ',
    category: 'shirts',
    brand: 'HERO',
    rows: [row()],
  })
  expect(await db.products.count()).toBe(1)

  await addStockEntries({
    name: 'Cotton Shirt',
    category: 'Shirts',
    brand: 'Other',
    rows: [row()],
  })
  expect(await db.products.count()).toBe(2)
})

test('any size text is accepted, even an empty one', async () => {
  const sizes = ['2-3 years', 'Free size', '', 'XXXXL', '28']
  const { entries } = await addStockEntries({
    name: 'Mixed',
    rows: sizes.map((size) => row({ size })),
  })

  expect(entries.map((e) => e.size)).toEqual(sizes)
  await expect(
    addStockEntries({
      name: 'Too long',
      rows: [row({ size: 'x'.repeat(51) })],
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
})

test('cost, MRP and the rest have sensible defaults', async () => {
  const { entries } = await addStockEntries({
    name: 'Plain',
    rows: [{ size: 'M', quantity: 4, sellingPricePaise: 59900 }],
  })

  expect(entries[0]).toMatchObject({
    costPaise: 0,
    mrpPaise: 59900,
    taxRatePercent: 5,
    priceIncludesTax: true,
    reorderThreshold: 3,
    currentStock: 4,
    unit: 'piece',
  })
})

test('a stock record is saved for every entry', async () => {
  await addStockEntries({
    name: 'Shirt',
    rows: [row({ size: 'M' }), row({ size: 'L', quantity: 5 })],
  })

  const movements = await db.stockMovements.toArray()
  expect(movements).toHaveLength(2)
  expect(
    movements.every((m) => m.type === 'opening' && m.reason === 'Stock entry'),
  ).toBe(true)
  expect(movements.map((m) => m.stockAfter).sort((a, b) => a - b)).toEqual([
    5, 10,
  ])
})

test('if one row is wrong, nothing at all is saved', async () => {
  await expect(
    addStockEntries({
      name: 'Shirt',
      rows: [row({ size: 'M' }), row({ size: 'L', quantity: -1 })],
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

  expect(await db.products.count()).toBe(0)
  expect(await db.variants.count()).toBe(0)
  expect(await db.stockMovements.count()).toBe(0)
  expect(await db.settings.get('barcodeCounter')).toBeUndefined()
})

test('a name and at least one row are required', async () => {
  await expect(
    addStockEntries({ name: '  ', rows: [row()] }),
  ).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  })
  await expect(
    addStockEntries({ name: 'Shirt', rows: [] }),
  ).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  })
})

test('the old rules are gone: the same SKU and size can be used again, only the barcode must be unique', async () => {
  const product = await createProduct({ name: 'Shirt' })
  const make = (barcode) =>
    createVariant({
      productId: product.id,
      size: 'M',
      sku: 'SAME',
      barcode,
      costPaise: 0,
      mrpPaise: 100,
      sellingPricePaise: 100,
      openingStock: 1,
    })

  await make('BC-0001')
  await make('BC-0002')
  expect(await db.variants.count()).toBe(2)

  await expect(make('BC-0001')).rejects.toMatchObject({
    code: 'DUPLICATE_BARCODE',
  })
})
