import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { adjustStock, updateVariant } from '../db/variantRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import { chunk, collectPending } from './collect'
import { markVariantsSynced, setCursor } from './cursors'

async function seedAndSell() {
  await seedSampleData()
  const variant = (await db.variants.toArray())[0]
  const product = await db.products.get(variant.productId)
  const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
  const { sale } = await createSale({ id: newId(), cart, payment: { method: 'cash' } })
  return { sale, variant }
}

const ofKind = (ops, kind) => ops.filter((op) => op.kind === kind)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('collects products, then items, then stock changes, then sales', async () => {
  await seedAndSell()
  const ops = await collectPending()
  const kinds = ops.map((op) => op.kind)

  expect(ofKind(ops, 'product')).toHaveLength(3)
  expect(ofKind(ops, 'variant')).toHaveLength(9)
  expect(ofKind(ops, 'movement')).toHaveLength(9)
  expect(ofKind(ops, 'sale')).toHaveLength(1)

  expect(kinds.lastIndexOf('product')).toBeLessThan(kinds.indexOf('variant'))
  expect(kinds.lastIndexOf('variant')).toBeLessThan(kinds.indexOf('movement'))
  expect(kinds.lastIndexOf('movement')).toBeLessThan(kinds.indexOf('sale'))
})

test('only collects what is after the cursor', async () => {
  await seedSampleData()
  const first = await collectPending()
  await setCursor('product', ofKind(first, 'product').at(-1).key)
  await setCursor('movement', ofKind(first, 'movement').at(-1).key)
  await markVariantsSynced(ofKind(first, 'variant'))

  expect(await collectPending()).toHaveLength(0)

  await db.products.add({
    id: 'zzz-new',
    name: 'New Product',
    category: 'Tees',
    brand: '',
    supplier: '',
    status: 'active',
    createdAt: '2099-01-01T00:00:00.000Z',
    updatedAt: '2099-01-01T00:00:00.000Z',
  })

  const next = await collectPending()
  expect(next.map((op) => op.entityId)).toEqual(['zzz-new'])
})

test('two products saved in the same millisecond are both collected, and the cursor can sit between them', async () => {
  const at = '2026-10-30T10:00:00.000Z'
  const base = { category: 'Shirts', brand: '', supplier: '', status: 'active', createdAt: at, updatedAt: at }
  await db.products.bulkAdd([
    { ...base, id: 'a1', name: 'First' },
    { ...base, id: 'b2', name: 'Second' },
  ])

  const all = await collectPending()
  expect(all.map((op) => op.entityId)).toEqual(['a1', 'b2'])

  await setCursor('product', ofKind(all, 'product')[0].key)
  expect((await collectPending()).map((op) => op.entityId)).toEqual(['b2'])
})

test('sale stock changes are not collected, but manual ones are', async () => {
  const { variant } = await seedAndSell()
  await adjustStock({ variantId: variant.id, quantityChange: -1, type: 'adjustment', reason: 'Damaged' })

  const movements = ofKind(await collectPending(), 'movement')

  expect(movements).toHaveLength(10) // 9 openings + 1 adjustment
  expect(movements.some((op) => op.data.type === 'sale')).toBe(false)
  expect(movements.some((op) => op.data.type === 'adjustment')).toBe(true)
})

test('only sales that are still pending are collected', async () => {
  const { sale } = await seedAndSell()
  const variant = (await db.variants.toArray())[1]
  const product = await db.products.get(variant.productId)
  const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
  const second = await createSale({ id: newId(), cart, payment: { method: 'cash' } })

  await db.sales.update(sale.id, { syncStatus: 'synced' })

  const sales = ofKind(await collectPending(), 'sale')
  expect(sales.map((op) => op.entityId)).toEqual([second.sale.id])
})


test('a stock change does not make an item pending, but a price change does', async () => {
  const { variant } = await seedAndSell()

  await markVariantsSynced(ofKind(await collectPending(), 'variant'))
  expect(ofKind(await collectPending(), 'variant')).toHaveLength(0)

  await adjustStock({
    variantId: variant.id,
    quantityChange: -1,
    type: 'adjustment',
    reason: 'Damaged',
  })

  expect(ofKind(await collectPending(), 'variant')).toHaveLength(0)

  // Choose a different price that respects the MRP validation rule.
  const newSellingPricePaise =
    variant.sellingPricePaise < variant.mrpPaise
      ? variant.sellingPricePaise + 1
      : variant.sellingPricePaise - 1

  await updateVariant(variant.id, {
    sellingPricePaise: newSellingPricePaise,
  })

  const pending = ofKind(await collectPending(), 'variant')
  expect(pending.map((op) => op.entityId)).toEqual([variant.id])
})


test('splits operations into batches and keeps their order', () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  expect(chunk([], 3)).toEqual([])
})