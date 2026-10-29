import { db } from './db'
import { archiveProduct } from './productRepo'
import { listSellableVariants } from './catalogRepo'
import { seedSampleData } from './sampleData'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedSampleData()
})

test('lists active variants together with their product', async () => {
  const items = await listSellableVariants()
  expect(items).toHaveLength(9)
  expect(items[0].product.name).toBe('Cotton Shirt')
  expect(items[0].variant.productId).toBe(items[0].product.id)
})

test('leaves out archived products', async () => {
  const shirt = await db.products.where('name').equals('Cotton Shirt').first()
  await archiveProduct(shirt.id)
  expect(await listSellableVariants()).toHaveLength(6)
})
