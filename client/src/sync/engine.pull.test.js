import { vi } from 'vitest'
import { db } from '../db/db'
import { adjustStock } from '../db/variantRepo'
import { clearDb, makeItem, sellItem } from '../test-utils/correctionFixtures'
import {
  fakeServer,
  movement,
  product,
  T,
  variant,
} from '../test-utils/pullFixtures'
import { NetworkError } from './apiClient'
import { listAttention, retryAttention } from './attention'
import { countPending } from './collect'
import { runSync } from './engine'

const answer = (ops, decide = () => undefined) => ({
  results: ops.map((op, index) => {
    const d = decide(op)
    const detail =
      typeof d === 'string' ? { status: d } : (d ?? { status: 'applied' })
    return { index, type: op.type, id: op.data.id, ...detail }
  }),
})

// An api with both directions. `log` records what was called, in order.
function makeApi(data, { log = [], push } = {}) {
  const server = fakeServer(
    data ?? { products: [], variants: [], movements: [], sales: [] },
  )
  return {
    log,
    server,
    push: vi.fn(async (ops) => {
      log.push('push')
      return push ? push(ops) : answer(ops)
    }),
    pullPage: vi.fn(async (kind, args) => {
      log.push(`pull:${kind}`)
      return server.pullPage(kind, args)
    }),
    pullSummary: server.pullSummary,
  }
}

beforeEach(clearDb)

test('nothing is downloaded unless it is asked for', async () => {
  const api = makeApi({
    products: [product('p1')],
    variants: [],
    movements: [],
    sales: [],
  })

  const summary = await runSync({ api })

  expect(summary.pulled).toBeNull()
  expect(api.pullPage).not.toHaveBeenCalled()
})

test('sending comes first, then downloading', async () => {
  await sellItem(await makeItem(), 1)
  const api = makeApi({
    products: [product('p1')],
    variants: [],
    movements: [],
    sales: [],
  })

  const summary = await runSync({ api, pull: true, forcePull: true })

  expect(summary.outcome).toBe('ok')
  expect(api.log[0]).toBe('push')
  expect(api.log.indexOf('push')).toBeLessThan(api.log.indexOf('pull:products'))
  expect(summary.pulled).toMatchObject({ products: 1 })
})

test('when sending fails, nothing is downloaded', async () => {
  await sellItem(await makeItem(), 1)
  const api = makeApi(undefined, {
    push: async () => {
      throw new NetworkError('Could not reach the server')
    },
  })

  const summary = await runSync({ api, pull: true, forcePull: true })

  expect(summary.outcome).toBe('offline')
  expect(api.pullPage).not.toHaveBeenCalled()
})

test('a download that was done a moment ago is skipped, unless it is forced', async () => {
  await db.settings.put({
    key: 'sync.pull',
    value: { cursors: {}, lastPullAt: new Date().toISOString() },
  })
  const api = makeApi({
    products: [product('p1')],
    variants: [],
    movements: [],
    sales: [],
  })

  const skipped = await runSync({ api, pull: true })
  expect(skipped.pulled).toBeNull()
  expect(api.pullPage).not.toHaveBeenCalled()

  const forced = await runSync({ api, pull: true, forcePull: true })
  expect(forced.pulled).toMatchObject({ products: 1 })
})

test('an api that cannot download is simply not asked to', async () => {
  const api = { push: vi.fn(async (ops) => answer(ops)) }

  const summary = await runSync({ api, pull: true, forcePull: true })

  expect(summary).toMatchObject({ outcome: 'ok', pulled: null })
})

test('when downloading fails the sending that worked is kept, and the run says it is offline', async () => {
  const sale = await sellItem(await makeItem(), 1)
  const api = makeApi()
  api.pullPage = vi.fn(async () => {
    throw new NetworkError('Could not reach the server')
  })

  const summary = await runSync({ api, pull: true, forcePull: true })

  expect(summary.outcome).toBe('offline')
  expect((await db.sales.get(sale.id)).syncStatus).toBe('synced')
  expect((await countPending()).total).toBe(0)
})

test('what was downloaded is never sent back', async () => {
  const api = makeApi({
    products: [product('p1')],
    variants: [variant('v1', 'p1')],
    movements: [movement('m1', 'v1')],
    sales: [],
  })
  await runSync({ api, pull: true, forcePull: true })
  api.push.mockClear()

  const again = await runSync({ api, pull: true, forcePull: true })

  expect(api.push).not.toHaveBeenCalled()
  expect(again.sent).toBe(0)
})

test('a first download sets the first-sync mark, so syncing can run by itself afterwards', async () => {
  const api = makeApi({
    products: [product('p1')],
    variants: [],
    movements: [],
    sales: [],
  })

  await runSync({ api, pull: true, forcePull: true })

  expect((await db.settings.get('sync.lastSuccessAt')).value).toEqual(
    expect.any(String),
  )
})

test('a stock change the server accepted is marked, and is not collected again', async () => {
  const item = await makeItem({ stock: 10 })
  await adjustStock({
    variantId: item.variant.id,
    quantityChange: -1,
    type: 'adjustment',
    reason: 'Damaged',
  })
  const api = makeApi()

  await runSync({ api })

  const movements = await db.stockMovements.toArray()
  expect(
    movements.filter((m) => m.type !== 'sale').every((m) => m.synced === 1),
  ).toBe(true)
  api.push.mockClear()
  await runSync({ api })
  expect(api.push).not.toHaveBeenCalled()
})

test('a stock change the server refused is not sent again, is remembered as only on this device, and can be retried', async () => {
  const item = await makeItem({ stock: 10 })
  await adjustStock({
    variantId: item.variant.id,
    quantityChange: -1,
    type: 'adjustment',
    reason: 'Damaged',
  })
  const refusing = makeApi(undefined, {
    push: async (ops) =>
      answer(ops, (op) =>
        op.type === 'stock.movement' && op.data.type === 'adjustment'
          ? {
              status: 'rejected',
              code: 'VARIANT_MISSING',
              message: 'Not on the server',
            }
          : undefined,
      ),
  })

  await runSync({ api: refusing })

  const refused = (await db.stockMovements.toArray()).find(
    (m) => m.type === 'adjustment',
  )
  expect(refused).toMatchObject({ rejected: 1 })
  expect(refused.synced).toBeUndefined()
  expect((await listAttention())[0]).toMatchObject({ kind: 'movement' })

  refusing.push.mockClear()
  await runSync({ api: refusing })
  expect(refusing.push).not.toHaveBeenCalled()

  await retryAttention((await listAttention())[0])
  const accepting = makeApi()
  await runSync({ api: accepting })
  const accepted = (await db.stockMovements.toArray()).find(
    (m) => m.type === 'adjustment',
  )
  expect(accepted.synced).toBe(1)
  expect(accepted.rejected).toBeUndefined()
})

test('a product edited after it was sent is sent again, by its content and not its time', async () => {
  const item = await makeItem()
  const api = makeApi()
  await runSync({ api })
  expect((await countPending()).products).toBe(0)

  await db.products.update(item.product.id, { name: 'Renamed' })
  expect((await countPending()).products).toBe(1)

  api.push.mockClear()
  await runSync({ api })
  const sent = api.push.mock.calls.flatMap(([ops]) => ops)
  expect(sent.map((op) => op.type)).toEqual(['product.upsert'])
  expect(sent[0].data).toMatchObject({ id: item.product.id, name: 'Renamed' })
  expect((await countPending()).products).toBe(0)
})

test('retrying a refused product sends it again', async () => {
  const item = await makeItem()
  const refusing = makeApi(undefined, {
    push: async (ops) =>
      answer(ops, (op) =>
        op.type === 'product.upsert'
          ? { status: 'rejected', code: 'X', message: 'Refused' }
          : undefined,
      ),
  })
  await runSync({ api: refusing })
  const [entry] = await listAttention()
  expect(entry).toMatchObject({ kind: 'product', entityId: item.product.id })
  expect((await countPending()).products).toBe(0)

  await retryAttention(entry)
  expect((await countPending()).products).toBe(1)
  const accepting = makeApi()
  await runSync({ api: accepting })
  expect(
    accepting.push.mock.calls.flatMap(([ops]) => ops).map((op) => op.type),
  ).toContain('product.upsert')
  expect(await listAttention()).toHaveLength(0)
})

test('the first download of an empty device downloads before anything else is asked of the server', async () => {
  const api = makeApi({
    products: [product('p1', { updatedAt: T(1) })],
    variants: [],
    movements: [],
    sales: [],
  })

  const summary = await runSync({ api, pull: true, forcePull: true })

  expect(api.push).not.toHaveBeenCalled()
  expect(summary).toMatchObject({
    outcome: 'ok',
    sent: 0,
    pulled: { products: 1 },
  })
  expect(await db.products.count()).toBe(1)
})
