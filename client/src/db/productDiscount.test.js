import { db } from './db'
import { createProduct, getProduct, updateProduct } from './productRepo'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('a new product allows discounts unless told otherwise', async () => {
  const normal = await createProduct({
    name: 'Cotton Shirt',
    category: 'Shirts',
  })
  expect(normal.discountAllowed).toBe(true)

  const branded = await createProduct({
    name: 'Branded Jacket',
    category: 'Jackets',
    discountAllowed: false,
  })
  expect(branded.discountAllowed).toBe(false)
  expect((await getProduct(branded.id)).discountAllowed).toBe(false)
})

test('the discount setting can be changed later', async () => {
  const product = await createProduct({
    name: 'Cotton Shirt',
    category: 'Shirts',
  })

  const changed = await updateProduct(product.id, { discountAllowed: false })
  expect(changed.discountAllowed).toBe(false)
  expect((await getProduct(product.id)).discountAllowed).toBe(false)

  const restored = await updateProduct(product.id, { discountAllowed: true })
  expect(restored.discountAllowed).toBe(true)
})

test('a product saved before this setting existed can still be edited', async () => {
  await db.products.add({
    id: 'old',
    name: 'Old Shirt',
    category: 'Shirts',
    brand: '',
    supplier: '',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  const updated = await updateProduct('old', { name: 'Older Shirt' })

  expect(updated.name).toBe('Older Shirt')
  expect(updated.discountAllowed).toBeUndefined()
})
