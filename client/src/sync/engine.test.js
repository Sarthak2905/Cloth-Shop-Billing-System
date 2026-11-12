import { vi } from 'vitest'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { adjustStock, updateVariant } from '../db/variantRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import { AuthError, NetworkError } from './apiClient'
import { listAttention, retryAttention } from './attention'
import { countPending } from './collect'
import { runSync } from './engine'

// The server's answer for each operation. `decide(op)` can return a status text,
// or { status, code, message }, or nothing (meaning "applied").
const answer = (ops, decide = () => undefined) => ({
  results: ops.map((op, index) => {
    const d = decide(op)
    const detail = typeof d === 'string' ? { status: d } : (d ?? { status: 'applied' })
    return { index, type: op.type, id: op.data.id, ...detail }
  }),
})

const fakeApi = (handler = async (ops) => answer(ops)) => ({ push: vi.fn(handler) })
const allOps = (api) => api.push.mock.calls.flatMap(([ops]) => ops)

async function seedAndSell() {
  await seedSampleData()
  const variant = (await db.variants.toArray())[0]
  const product = await db.products.get(variant.productId)
  const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
  const { sale } = await createSale({ id: newId(), cart, payment: { method: 'cash' } })
  return { sale, variant }
}

// 22 operations: 3 products, 9 items, 9 stock changes, 1 sale (batches of 20 and 2).
const TOTAL_OPS = 22

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('sends products, items, stock changes and sales in order, and marks everything synced', async () => {
  const { sale } = await seedAndSell()
  const api = fakeApi()

  const summary = await runSync({ api })

  expect(summary).toMatchObject({ outcome: 'ok', sent: TOTAL_OPS, applied: TOTAL_OPS, remaining: 0 })
  expect(api.push).toHaveBeenCalledTimes(2)

  const types = allOps(api).map((op) => op.type)
  expect(types.lastIndexOf('product.upsert')).toBeLessThan(types.indexOf('variant.upsert'))
  expect(types.lastIndexOf('variant.upsert')).toBeLessThan(types.indexOf('stock.movement'))
  expect(types.lastIndexOf('stock.movement')).toBeLessThan(types.indexOf('sale.create'))
  expect(types.filter((t) => t === 'sale.create')).toHaveLength(1)

  expect((await countPending()).total).toBe(0)
  const saved = await db.sales.get(sale.id)
  expect(saved.syncStatus).toBe('synced')
  expect(saved.syncedAt).toBeTruthy()
})

test('a second run has nothing to send and does not call the server', async () => {
  await seedAndSell()
  const api = fakeApi()
  await runSync({ api })
  api.push.mockClear()

  const summary = await runSync({ api })

  expect(summary).toMatchObject({ outcome: 'ok', sent: 0 })
  expect(api.push).not.toHaveBeenCalled()
})

test('when the server cannot be reached everything stays waiting', async () => {
  await seedAndSell()
  const api = fakeApi(async () => {
    throw new NetworkError('Could not reach the server')
  })

  const summary = await runSync({ api })

  expect(summary.outcome).toBe('offline')
  expect(summary.message).toBe('Could not reach the server')
  expect((await countPending()).total).toBe(TOTAL_OPS)
})

test('an expired login stops the run and keeps everything waiting', async () => {
  await seedAndSell()
  const api = fakeApi(async () => {
    throw new AuthError('expired')
  })

  const summary = await runSync({ api })

  expect(summary.outcome).toBe('auth')
  expect((await countPending()).total).toBe(TOTAL_OPS)
})

test('a temporary server error keeps that batch waiting and does not lose earlier progress', async () => {
  await seedAndSell()
  const api = fakeApi(async (ops) =>
    answer(ops, (op) => (op.type === 'sale.create' ? 'error' : undefined)),
  )

  const summary = await runSync({ api })

  expect(summary.outcome).toBe('server-error')
  const pending = await countPending()
  expect(pending).toMatchObject({ products: 0, variants: 0, movements: 1, sales: 1 })
})

test('a refused sale goes to needs-attention, is kept on the device and is not sent again', async () => {
  const { sale } = await seedAndSell()
  const api = fakeApi(async (ops) =>
    answer(ops, (op) =>
      op.type === 'sale.create'
        ? { status: 'rejected', code: 'UNKNOWN_VARIANT', message: 'Item does not exist' }
        : undefined,
    ),
  )

  const summary = await runSync({ api })

  expect(summary).toMatchObject({ outcome: 'ok', rejected: 1 })
  const saved = await db.sales.get(sale.id)
  expect(saved.syncStatus).toBe('review')
  expect(saved.syncMessage).toBe('Item does not exist')

  const attention = await listAttention()
  expect(attention).toHaveLength(1)
  expect(attention[0]).toMatchObject({ kind: 'sale', entityId: sale.id, code: 'UNKNOWN_VARIANT' })

  api.push.mockClear()
  await runSync({ api })
  expect(api.push).not.toHaveBeenCalled()
  expect((await countPending()).attention).toBe(1)
})

test('a refused catalogue item is listed, and sending it again after fixing it clears the entry', async () => {
  await seedSampleData()
  let refusedId = null
  const refusing = fakeApi(async (ops) =>
    answer(ops, (op) => {
      if (op.type === 'variant.upsert' && !refusedId) {
        refusedId = op.data.id
        return { status: 'rejected', code: 'DUPLICATE_BARCODE', message: 'Barcode already used' }
      }
      return undefined
    }),
  )

  await runSync({ api: refusing })

  const attention = await listAttention()
  expect(attention).toHaveLength(1)
  expect(attention[0]).toMatchObject({ kind: 'variant', entityId: refusedId })
  expect((await countPending()).variants).toBe(0)

  await updateVariant(refusedId, { sellingPricePaise: 1000 })
  const accepting = fakeApi()
  await runSync({ api: accepting })

  expect(allOps(accepting).map((op) => op.data.id)).toEqual([refusedId])
  expect(await listAttention()).toHaveLength(0)
})

test('things the server already has count as done', async () => {
  const { sale } = await seedAndSell()
  const api = fakeApi(async (ops) => answer(ops, () => 'duplicate'))

  const summary = await runSync({ api })

  expect(summary).toMatchObject({ outcome: 'ok', duplicate: TOTAL_OPS, applied: 0 })
  expect((await db.sales.get(sale.id)).syncStatus).toBe('synced')
})

test('progress is kept when the connection drops part-way', async () => {
  await seedAndSell()
  let calls = 0
  const api = fakeApi(async (ops) => {
    calls += 1
    if (calls === 2) throw new NetworkError('Could not reach the server')
    return answer(ops)
  })

  const summary = await runSync({ api })

  expect(summary.outcome).toBe('offline')
  expect(summary.remaining).toBe(2)
  const pending = await countPending()
  expect(pending).toMatchObject({ products: 0, variants: 0, movements: 1, sales: 1 })
})

test('retrying a refused sale sends it again, and success clears it', async () => {
  const { sale } = await seedAndSell()
  const refusing = fakeApi(async (ops) =>
    answer(ops, (op) =>
      op.type === 'sale.create' ? { status: 'rejected', code: 'X', message: 'Not now' } : undefined,
    ),
  )
  await runSync({ api: refusing })
  const [item] = await listAttention()

  await retryAttention(item)
  expect((await db.sales.get(sale.id)).syncStatus).toBe('pending')
  expect(await listAttention()).toHaveLength(0)

  const accepting = fakeApi()
  await runSync({ api: accepting })
  expect((await db.sales.get(sale.id)).syncStatus).toBe('synced')
  expect(allOps(accepting).map((op) => op.type)).toEqual(['sale.create'])
})

test('retrying refused products and items sends them again', async () => {
  await seedSampleData()
  const product = (await db.products.toArray())[0]
  const variant = (await db.variants.toArray())[0]
  const refusing = fakeApi(async (ops) =>
    answer(ops, (op) =>
      op.data.id === product.id || op.data.id === variant.id
        ? { status: 'rejected', code: 'X', message: 'Refused' }
        : undefined,
    ),
  )
  await runSync({ api: refusing })
  expect(await listAttention()).toHaveLength(2)

  for (const item of await listAttention()) await retryAttention(item)

  const accepting = fakeApi()
  await runSync({ api: accepting })
  const sentIds = allOps(accepting).map((op) => op.data.id)
  expect(sentIds).toContain(product.id)
  expect(sentIds).toContain(variant.id)
  expect(await listAttention()).toHaveLength(0)
})

test('only one run happens at a time', async () => {
  await seedAndSell()
  const api = fakeApi(async (ops) => {
    await new Promise((resolve) => setTimeout(resolve, 20))
    return answer(ops)
  })

  const first = runSync({ api })
  const second = runSync({ api })

  expect(first).toBe(second)
  await Promise.all([first, second])
  expect(api.push).toHaveBeenCalledTimes(2) // two batches, not four
})

test('manual stock changes are sent, sale stock changes are not', async () => {
  const { variant } = await seedAndSell()
  await adjustStock({ variantId: variant.id, quantityChange: -2, type: 'adjustment', reason: 'Damaged' })
  const api = fakeApi()

  await runSync({ api })

  const movements = allOps(api).filter((op) => op.type === 'stock.movement')
  expect(movements).toHaveLength(10)
  expect(
    movements.some((op) => op.data.type === 'adjustment' && op.data.quantityChange === -2),
  ).toBe(true)
  expect(movements.some((op) => op.data.type === 'sale')).toBe(false)
})