import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { compareStock } from './stockCheck'

const serverLevels = async (change) => {
  const variants = await db.variants.toArray()
  const items = variants.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    currentStock: v.currentStock,
    status: v.status,
  }))
  return change ? change(items) : items
}

const apiWith = (items) => ({ stockLevels: async () => ({ items }) })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedSampleData()
})

test('reports nothing when the stock matches', async () => {
  const result = await compareStock(apiWith(await serverLevels()))
  expect(result.checked).toBe(9)
  expect(result.mismatches).toEqual([])
  expect(result.onlyOnServer).toEqual([])
})

test('lists items whose stock differs, and items the server does not have', async () => {
  const items = await serverLevels()
  const different = items[0]
  const missing = items[1]
  const levels = items
    .filter((item) => item.variantId !== missing.variantId)
    .map((item) =>
      item.variantId === different.variantId ? { ...item, currentStock: item.currentStock + 5 } : item,
    )

  const result = await compareStock(apiWith(levels))

  expect(result.mismatches).toHaveLength(2)
  expect(result.mismatches).toContainEqual({
    variantId: different.variantId,
    sku: different.sku,
    local: different.currentStock,
    server: different.currentStock + 5,
  })
  expect(result.mismatches).toContainEqual({
    variantId: missing.variantId,
    sku: missing.sku,
    local: missing.currentStock,
    server: null,
  })
})

test('lists items that exist only on the server', async () => {
  const items = await serverLevels((list) => [
    ...list,
    { variantId: 'server-only', sku: 'ONLY-1', currentStock: 4, status: 'active' },
  ])

  const result = await compareStock(apiWith(items))

  expect(result.mismatches).toEqual([])
  expect(result.onlyOnServer).toEqual([{ variantId: 'server-only', sku: 'ONLY-1', server: 4 }])
})