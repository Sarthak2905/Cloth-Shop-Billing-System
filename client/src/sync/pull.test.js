import { vi } from 'vitest'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { exportBackup, validateBackup } from '../backup/backupService'
import { db } from '../db/db'
import { createSale } from '../db/saleRepo'
import { takeBarcodes } from '../db/variantRepo'
import { newId } from '../lib/id'
import {
  fakeServer,
  movement,
  product,
  sale,
  T,
  variant,
} from '../test-utils/pullFixtures'
import { NetworkError } from './apiClient'
import { countPending } from './collect'
import { getPullState } from './cursors'
import { overlapCursor, parseInvoice, pullAll, pullIsDue } from './pull'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const nextBarcode = () =>
  db.transaction(
    'rw',
    db.settings,
    db.variants,
    db.products,
    db.stockMovements,
    async () => (await takeBarcodes(1))[0],
  )

function shopData(over = {}) {
  return {
    products: [product('p1'), product('p2')],
    variants: [
      variant('v1', 'p1', { barcode: 'CLO000001' }),
      variant('v2', 'p1', { barcode: 'CLO000002', size: 'L', currentStock: 4 }),
      variant('v3', 'p2', {
        barcode: 'CLO000003',
        unit: 'meter',
        currentStock: 2550,
        size: 'Grey',
      }),
    ],
    movements: [
      movement('m1', 'v1'),
      movement('m2', 'v2', { quantityChange: 4, stockAfter: 4 }),
      movement('m3', 'v3', { quantityChange: 2550, stockAfter: 2550 }),
      movement('m4', 'v1', {
        type: 'sale',
        quantityChange: -1,
        stockAfter: 9,
        referenceId: 's1',
        occurredAt: T(5),
      }),
    ],
    sales: [
      sale('s1', 'INV-000001'),
      sale('s2', 'INV-000002', { soldAt: T(7), updatedAt: T(7) }),
    ],
    ...over,
  }
}

// ----------------------------------------------------------------------------- small helpers

test('the next download starts 30 seconds before the last row, from the start of that millisecond', () => {
  expect(overlapCursor('2026-11-19T10:00:30.000Z|abc')).toBe(
    '2026-11-19T10:00:00.000Z|!',
  )
  expect(overlapCursor('')).toBeUndefined()
  expect(overlapCursor(null)).toBeUndefined()
  expect(overlapCursor('garbage')).toBeUndefined()
})

test('an invoice number is split into its prefix and number, and a server-made one has no number', () => {
  expect(parseInvoice('INV-000012')).toEqual({ prefix: 'INV', sequence: 12 })
  expect(parseInvoice('SH2-000007')).toEqual({ prefix: 'SH2', sequence: 7 })
  expect(parseInvoice('INV-S000003')).toBeNull()
  expect(parseInvoice('nonsense')).toBeNull()
  expect(parseInvoice(undefined)).toBeNull()
})

test('a download is due when there never was one, or the last one is old enough', async () => {
  expect(await pullIsDue(120_000)).toBe(true)

  await db.settings.put({
    key: 'sync.pull',
    value: {
      cursors: {},
      lastPullAt: new Date(Date.now() - 10_000).toISOString(),
    },
  })
  expect(await pullIsDue(120_000)).toBe(false)
  expect(await pullIsDue(5_000)).toBe(true)
})

// ----------------------------------------------------------------- a brand-new device

test('a new device downloads everything and has nothing left to send', async () => {
  const server = fakeServer(shopData())

  const summary = await pullAll({ api: server })

  expect(summary).toMatchObject({
    products: 2,
    variants: 3,
    movements: 4,
    sales: 2,
    skipped: 0,
    conflicts: [],
  })
  expect(await db.products.count()).toBe(2)
  expect(await db.variants.count()).toBe(3)
  expect(await db.stockMovements.count()).toBe(4)
  expect(await db.sales.count()).toBe(2)
  expect(await db.saleItems.count()).toBe(2)

  const counts = await countPending()
  expect(counts.total).toBe(0)
  expect(counts.attention).toBe(0)
})

test('downloaded rows have the shape this device stores', async () => {
  await pullAll({ api: fakeServer(shopData()) })

  expect(await db.variants.get('v3')).toMatchObject({
    barcode: 'CLO000003',
    unit: 'meter',
    currentStock: 2550,
    size: 'Grey',
    costPaise: 30000,
  })
  expect(await db.variants.get('v1')).not.toHaveProperty('packSize')
  expect(await db.sales.get('s1')).toMatchObject({
    invoiceNumber: 'INV-000001',
    invoiceSequence: 1,
    status: 'completed',
    syncStatus: 'synced',
    createdAt: T(5), // when the bill was made
    totalPaise: 79900,
    paymentStatus: 'paid',
    paymentRev: 0,
  })
  const items = await db.saleItems.where('saleId').equals('s1').toArray()
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({
    id: 's1:1',
    productName: 'Product p1',
    costPaise: 30000,
    quantity: 1,
  })
  // a stock change keeps the time it really happened, and counts as already on the server
  expect(await db.stockMovements.get('m4')).toMatchObject({
    createdAt: T(5),
    synced: 1,
    type: 'sale',
  })
})

test('an item with a box size keeps it', async () => {
  await pullAll({
    api: fakeServer({
      ...shopData(),
      variants: [variant('v1', 'p1', { barcode: 'CLO000001', packSize: 10 })],
    }),
  })

  expect((await db.variants.get('v1')).packSize).toBe(10)
})

test('downloading twice changes nothing and adds nothing twice', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })
  await pullAll({ api: server })

  expect(await db.products.count()).toBe(2)
  expect(await db.variants.count()).toBe(3)
  expect(await db.stockMovements.count()).toBe(4)
  expect(await db.sales.count()).toBe(2)
  expect(await db.saleItems.count()).toBe(2)
  expect((await countPending()).total).toBe(0)
})

test('what was downloaded makes a valid backup', async () => {
  await pullAll({ api: fakeServer(shopData()) })

  const check = validateBackup(await exportBackup())

  expect(check).toMatchObject({ ok: true })
})

test('progress is reported with the totals', async () => {
  const onProgress = vi.fn()

  await pullAll({ api: fakeServer(shopData()), onProgress })

  expect(onProgress).toHaveBeenCalledWith({
    kind: 'products',
    done: 2,
    total: 2,
  })
  expect(onProgress).toHaveBeenCalledWith({
    kind: 'variants',
    done: 3,
    total: 3,
  })
  expect(onProgress).toHaveBeenCalledWith({ kind: 'sales', done: 2, total: 2 })
})

test('the result of the last download is kept for the Sync page', async () => {
  await pullAll({ api: fakeServer(shopData()) })

  const saved = (await db.settings.get('sync.lastPullResult')).value
  expect(saved).toMatchObject({
    products: 2,
    variants: 3,
    movements: 4,
    sales: 2,
  })
  expect(saved.at).toEqual(expect.any(String))
  expect((await getPullState()).lastPullAt).toBe(saved.at)
})

// ------------------------------------------------------------------------ the counters

test('the next bill made here continues after the highest invoice number that came down', async () => {
  await pullAll({
    api: fakeServer({
      ...shopData(),
      sales: [
        sale('s1', 'INV-000007'),
        sale('s2', 'INV-000012', { soldAt: T(7), updatedAt: T(7) }),
        sale('s3', 'INV-S000003', { soldAt: T(8), updatedAt: T(8) }), // made by the server: no number
        sale('s4', 'XYZ-000099', { soldAt: T(9), updatedAt: T(9) }), // another series
      ],
    }),
  })

  expect((await db.settings.get('invoiceCounter')).value).toBe(12)

  const item = (await db.variants.toArray())[0]
  const cart = addItem(
    createCart(),
    lineFromVariant(item, await db.products.get(item.productId)),
  ).cart
  const { sale: made } = await createSale({ id: newId(), cart, payments: [] })
  expect(made.invoiceNumber).toBe('INV-000013')
})

test('the invoice counter is never lowered', async () => {
  await db.settings.put({ key: 'invoiceCounter', value: 20 })

  await pullAll({ api: fakeServer(shopData()) })

  expect((await db.settings.get('invoiceCounter')).value).toBe(20)
})

test('new automatic barcodes go past the highest barcode that came down', async () => {
  await pullAll({
    api: fakeServer({
      ...shopData(),
      variants: [
        variant('v1', 'p1', { barcode: 'CLO000040' }),
        variant('v2', 'p1', { barcode: 'CLO000007', size: 'L' }),
      ],
    }),
  })

  const next = await nextBarcode()

  expect(next).toMatch(/^CLO\d{6}$/)
  expect(Number(next.slice(3))).toBeGreaterThan(40)
  expect((await getPullState()).barcodeRaisedTo).toBe(40)
})

// ----------------------------------------------------------------------- stock safety

test("an item's stock keeps what this device sold but has not sent yet", async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })

  const item = await db.variants.get('v1')
  const cart = addItem(
    createCart(),
    lineFromVariant({ ...item, currentStock: 10 }, await db.products.get('p1')),
  ).cart
  const { sale: made } = await createSale({ id: newId(), cart, payments: [] })
  expect((await db.variants.get('v1')).currentStock).toBe(9)

  // the server does not know about that bill yet, and the item changed there for another reason
  server.data.variants = server.data.variants.map((v) =>
    v.id === 'v1'
      ? {
          ...v,
          currentStock: 10,
          sellingPricePaise: v.sellingPricePaise,
          updatedAt: T(20),
        }
      : v,
  )
  await pullAll({ api: server })
  expect((await db.variants.get('v1')).currentStock).toBe(9)

  // once the server has the bill, its stock is the truth
  await db.sales.update(made.id, { syncStatus: 'synced' })
  server.data.variants = server.data.variants.map((v) =>
    v.id === 'v1' ? { ...v, currentStock: 9, updatedAt: T(30) } : v,
  )
  const summary = await pullAll({ api: server })
  expect((await db.variants.get('v1')).currentStock).toBe(9)
  expect(summary.stockChanged).toBe(0)
})

test('a stock change made on another computer shows here, and is counted', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })

  server.data.variants = server.data.variants.map((v) =>
    v.id === 'v2' ? { ...v, currentStock: 1, updatedAt: T(20) } : v,
  )
  const summary = await pullAll({ api: server })

  expect((await db.variants.get('v2')).currentStock).toBe(1)
  expect(summary.stockChanged).toBe(1)
})

test('a stock change made here and not sent yet is kept on top of the server stock', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })
  const item = await db.variants.get('v2')
  await db.variants.update('v2', { currentStock: item.currentStock - 2 })
  await db.stockMovements.add({
    id: 'local-adjustment',
    variantId: 'v2',
    type: 'adjustment',
    quantityChange: -2,
    stockAfter: 2,
    reason: 'Damaged',
    referenceId: null,
    createdAt: T(40),
  })

  server.data.variants = server.data.variants.map((v) =>
    v.id === 'v2' ? { ...v, currentStock: 4, updatedAt: T(41) } : v,
  )
  await pullAll({ api: server })

  expect((await db.variants.get('v2')).currentStock).toBe(2)
})

// ---------------------------------------------------- changes made here are never overwritten

test('a product edited here and not sent yet is not overwritten, and is still waiting to be sent', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })
  await db.products.update('p1', { name: 'Edited here' })

  server.data.products = server.data.products.map((p) =>
    p.id === 'p1' ? { ...p, name: 'Edited there', updatedAt: T(20) } : p,
  )
  const summary = await pullAll({ api: server })

  expect((await db.products.get('p1')).name).toBe('Edited here')
  expect(summary.skipped).toBe(1)
  expect((await countPending()).products).toBe(1)
})

test('an item edited here and not sent yet is not overwritten', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })
  await db.variants.update('v1', { sellingPricePaise: 1 })

  server.data.variants = server.data.variants.map((v) =>
    v.id === 'v1'
      ? { ...v, sellingPricePaise: 5, currentStock: 3, updatedAt: T(20) }
      : v,
  )
  const summary = await pullAll({ api: server })

  expect(await db.variants.get('v1')).toMatchObject({
    sellingPricePaise: 1,
    currentStock: 10,
  })
  expect(summary.skipped).toBe(1)
})

test('a product changed on the server comes down when nothing was changed here', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })

  server.data.products = server.data.products.map((p) =>
    p.id === 'p1'
      ? { ...p, name: 'Renamed there', status: 'archived', updatedAt: T(20) }
      : p,
  )
  await pullAll({ api: server })

  expect(await db.products.get('p1')).toMatchObject({
    name: 'Renamed there',
    status: 'archived',
  })
  expect((await countPending()).total).toBe(0)
})

test('a bill that changed on the server (cancelled, payment cleared) is updated, with its items intact', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })

  server.data.sales = server.data.sales.map((s) =>
    s.id === 's1'
      ? {
          ...s,
          status: 'cancelled',
          cancelReason: 'Wrong price',
          cancelledAt: T(25),
          paymentStatus: 'pending',
          receivedPaise: 0,
          payments: [],
          paymentRev: 2,
          updatedAt: T(25),
        }
      : s,
  )
  await pullAll({ api: server })

  expect(await db.sales.get('s1')).toMatchObject({
    status: 'cancelled',
    cancelReason: 'Wrong price',
    paymentStatus: 'pending',
    paymentRev: 2,
    syncStatus: 'synced',
  })
  expect(await db.saleItems.where('saleId').equals('s1').count()).toBe(1)
  expect((await countPending()).total).toBe(0)
})

test('a bill with a payment or cancellation still waiting to be sent is not overwritten', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })
  await db.sales.update('s1', { paymentPending: 1, paymentRev: 1 })

  server.data.sales = server.data.sales.map((s) =>
    s.id === 's1'
      ? {
          ...s,
          paymentStatus: 'pending',
          receivedPaise: 0,
          payments: [],
          updatedAt: T(25),
        }
      : s,
  )
  const summary = await pullAll({ api: server })

  expect(await db.sales.get('s1')).toMatchObject({
    paymentStatus: 'paid',
    receivedPaise: 79900,
    paymentRev: 1,
  })
  expect(summary.skipped).toBe(1)
})

// ----------------------------------------------------------------------------- clashes

test('an invoice number that a different bill on this device already uses is reported, not downloaded', async () => {
  await db.sales.add({
    id: 'local-sale',
    invoiceNumber: 'INV-000001',
    status: 'completed',
    syncStatus: 'synced',
    createdAt: T(1),
    totalPaise: 100,
  })

  const summary = await pullAll({ api: fakeServer(shopData()) })

  expect(summary.conflicts).toEqual([
    'Invoice INV-000001 is used by a different bill on this device',
  ])
  expect((await db.sales.get('local-sale')).totalPaise).toBe(100)
  expect(await db.sales.get('s1')).toBeUndefined()
  expect(await db.sales.get('s2')).toBeDefined() // the others still came
})

test('a barcode that a different item on this device already uses is reported, not downloaded', async () => {
  await db.variants.add({
    id: 'local-item',
    productId: 'px',
    sku: 'x',
    barcode: 'CLO000001',
    size: '',
    unit: 'piece',
    costPaise: 0,
    mrpPaise: 100,
    sellingPricePaise: 100,
    taxRatePercent: 0,
    priceIncludesTax: true,
    reorderThreshold: 0,
    currentStock: 5,
    status: 'active',
    createdAt: T(1),
    updatedAt: T(1),
  })

  const summary = await pullAll({ api: fakeServer(shopData()) })

  expect(summary.conflicts).toEqual([
    'Barcode CLO000001 is used by a different item on this device',
  ])
  expect(await db.variants.get('v1')).toBeUndefined()
  expect(await db.variants.get('v2')).toBeDefined()
})

// ------------------------------------------------------------- places and dropped connections

test('where each download ended is saved, and the next one starts 30 seconds before it', async () => {
  const server = fakeServer(shopData())
  await pullAll({ api: server })

  const state = await getPullState()
  expect(state.cursors.products).toBe(`${T(1)}|p2`)
  expect(state.cursors.movements).toBe(`${T(3)}|m4`)

  server.data.products = [
    ...server.data.products,
    product('p3', { updatedAt: T(30) }),
  ]
  server.calls.length = 0
  await pullAll({ api: server })

  const firstProductCall = server.calls.find((c) => c.kind === 'products')
  expect(firstProductCall.after).toBe(overlapCursor(`${T(1)}|p2`))
  expect(await db.products.count()).toBe(3)
})

test('when the connection drops, what was downloaded is kept and the next run continues', async () => {
  const data = shopData({
    products: [product('p1'), product('p2'), product('p3')],
  })
  const real = fakeServer(data, { pageSize: 1 })
  let calls = 0
  const flaky = {
    ...real,
    pullPage: vi.fn(async (kind, args) => {
      calls += 1
      if (calls === 2) throw new NetworkError('Could not reach the server')
      return real.pullPage(kind, args)
    }),
  }

  await expect(pullAll({ api: flaky })).rejects.toBeInstanceOf(NetworkError)

  expect(await db.products.count()).toBe(1)
  expect((await getPullState()).cursors.products).toBe(`${T(1)}|p1`)

  real.calls.length = 0
  await pullAll({ api: real })

  expect(await db.products.count()).toBe(3)
  expect(real.calls[0]).toEqual({
    kind: 'products',
    after: overlapCursor(`${T(1)}|p1`),
  })
})

test('the progress totals are optional: a server without a summary still downloads', async () => {
  const server = fakeServer(shopData())
  server.pullSummary.mockRejectedValue(new Error('no summary'))

  const summary = await pullAll({ api: server })

  expect(summary.products).toBe(2)
})
