import { db } from './db'
import {
  createProduct,
  updateProduct,
  archiveProduct,
  listProducts,
  getProduct,
} from './productRepo'
import {
  createVariant,
  getVariant,
  getVariantByBarcode,
  updateVariant,
  adjustStock,
  listVariantsByProduct,
} from './variantRepo'
import { getSettings, updateSettings } from './settingsRepo'

const shirt = { name: 'Cotton Shirt', category: 'Shirts', brand: 'UrbanFit' }

const variantInput = (productId, over = {}) => ({
  productId,
  sku: 'SHIRT-BLU-M',
  barcode: 'CLO000001',
  size: 'M',
  costPaise: 30000,
  mrpPaise: 79900,
  sellingPricePaise: 69900,
  taxRatePercent: 5,
  ...over,
})

const expectCode = (promise, code) =>
  expect(promise).rejects.toMatchObject({ code })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('products', () => {
  test('creates a product with defaults', async () => {
    const p = await createProduct(shirt)
    expect(p.status).toBe('active')
    expect(p.supplier).toBe('')
    expect((await getProduct(p.id)).name).toBe('Cotton Shirt')
  })

  test('rejects an empty name', async () => {
    await expectCode(
      createProduct({ ...shirt, name: '  ' }),
      'VALIDATION_ERROR',
    )
  })

  test('updates a product', async () => {
    const p = await createProduct(shirt)
    const updated = await updateProduct(p.id, { name: 'Linen Shirt' })
    expect(updated.name).toBe('Linen Shirt')
    expect(updated.category).toBe('Shirts')
  })

  test('archiving a product archives its variants and hides it from the list', async () => {
    const p = await createProduct(shirt)
    const v = await createVariant(variantInput(p.id))
    await archiveProduct(p.id)
    expect(await listProducts()).toHaveLength(0)
    expect((await getVariant(v.id)).status).toBe('archived')
  })
})

describe('variants', () => {
  test('creates a variant and records opening stock as a movement', async () => {
    const p = await createProduct(shirt)
    const v = await createVariant(variantInput(p.id, { openingStock: 10 }))
    expect(v.currentStock).toBe(10)
    const movements = await db.stockMovements
      .where('variantId')
      .equals(v.id)
      .toArray()
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      type: 'opening',
      quantityChange: 10,
      stockAfter: 10,
    })
  })

  test('size M and size L of the same shirt are separate variants', async () => {
    const p = await createProduct(shirt)
    await createVariant(variantInput(p.id))
    await createVariant(
      variantInput(p.id, {
        sku: 'SHIRT-BLU-L',
        barcode: 'CLO000002',
        size: 'L',
      }),
    )
    expect(await listVariantsByProduct(p.id)).toHaveLength(2)
    expect((await getVariantByBarcode('CLO000002')).size).toBe('L')
  })

  test('rejects a duplicate barcode', async () => {
    const p = await createProduct(shirt)
    await createVariant(variantInput(p.id))
    await expectCode(
      createVariant(variantInput(p.id, { sku: 'OTHER-SKU', size: 'L' })),
      'DUPLICATE_BARCODE',
    )
  })


  test('returns undefined for an unknown barcode', async () => {
    expect(await getVariantByBarcode('NOPE1234')).toBeUndefined()
  })

  test('updateVariant cannot change stock directly', async () => {
    const p = await createProduct(shirt)
    const v = await createVariant(variantInput(p.id, { openingStock: 5 }))
    const updated = await updateVariant(v.id, {
      sellingPricePaise: 65000,
      currentStock: 999,
    })
    expect(updated.sellingPricePaise).toBe(65000)
    expect(updated.currentStock).toBe(5)
  })
})

describe('stock adjustments', () => {
  test('records each change with the resulting stock level', async () => {
    const p = await createProduct(shirt)
    const v = await createVariant(variantInput(p.id, { openingStock: 10 }))
    await adjustStock({
      variantId: v.id,
      quantityChange: -3,
      type: 'sale',
      referenceId: 'bill-1',
    })
    await adjustStock({ variantId: v.id, quantityChange: 5, type: 'purchase' })
    expect((await getVariant(v.id)).currentStock).toBe(12)
    const movements = await db.stockMovements
      .where('variantId')
      .equals(v.id)
      .sortBy('createdAt')
    expect(movements.map((m) => m.stockAfter)).toEqual([10, 7, 12])
  })

  test('blocks negative stock and leaves everything unchanged', async () => {
    const p = await createProduct(shirt)
    const v = await createVariant(variantInput(p.id, { openingStock: 2 }))
    await expectCode(
      adjustStock({ variantId: v.id, quantityChange: -5, type: 'sale' }),
      'NEGATIVE_STOCK',
    )
    expect((await getVariant(v.id)).currentStock).toBe(2)
    expect(await db.stockMovements.count()).toBe(1) // only the opening movement
  })

  test('requires a reason for manual adjustments', async () => {
    const p = await createProduct(shirt)
    const v = await createVariant(variantInput(p.id, { openingStock: 2 }))
    await expectCode(
      adjustStock({ variantId: v.id, quantityChange: -1, type: 'adjustment' }),
      'VALIDATION_ERROR',
    )
  })
})

describe('settings', () => {
  test('returns defaults before anything is saved', async () => {
    const s = await getSettings()
    expect(s.invoicePrefix).toBe('INV')
    expect(s.allowNegativeStock).toBe(false)
  })

  test('saves and reloads changes', async () => {
    await updateSettings({ shopName: 'Sarthak Fashions', invoicePrefix: 'SF' })
    const s = await getSettings()
    expect(s.shopName).toBe('Sarthak Fashions')
    expect(s.invoicePrefix).toBe('SF')
    expect(s.address).toBe('')
  })

  test('rejects an invalid invoice prefix', async () => {
    await expectCode(
      updateSettings({ invoicePrefix: 'bad prefix!' }),
      'VALIDATION_ERROR',
    )
  })
})
