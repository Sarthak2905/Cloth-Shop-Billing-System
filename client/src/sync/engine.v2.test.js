import { vi } from 'vitest'
import { db } from '../db/db'
import { recordPayments } from '../db/paymentRepo'
import {
  clearDb,
  correctUnchanged,
  makeItem,
  sellItem,
} from '../test-utils/correctionFixtures'
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
const fakeApi = (handler = async (ops) => answer(ops)) => ({
  push: vi.fn(handler),
})
const allOps = (api) => api.push.mock.calls.flatMap(([ops]) => ops)
const types = (api) => allOps(api).map((op) => op.type)
// Keeps the time of one step clearly after the one before it.
const pause = () => new Promise((resolve) => setTimeout(resolve, 5))

beforeEach(clearDb)

// A bill that has been sent to the server.
async function syncedSale(quantity = 2) {
  const item = await makeItem({ stock: 10 })
  const sale = await sellItem(item, quantity)
  await runSync({ api: fakeApi() })
  await pause()
  return { item, sale }
}

test('a payment recorded after the bill was sent is sent once, and then it is done', async () => {
  const { sale } = await syncedSale()
  expect((await countPending()).total).toBe(0)

  await recordPayments({
    saleId: sale.id,
    payments: [{ method: 'cash', amountPaise: 100000 }],
  })
  expect((await countPending()).payments).toBe(1)

  const api = fakeApi()
  const summary = await runSync({ api })

  expect(summary.outcome).toBe('ok')
  expect(types(api)).toEqual(['sale.payment'])
  expect(allOps(api)[0]).toEqual({
    type: 'sale.payment',
    data: {
      saleId: sale.id,
      payments: [{ method: 'cash', amountPaise: 100000 }],
      recordedAt: expect.any(String),
      rev: 1,
    },
  })
  expect((await countPending()).total).toBe(0)
  expect((await db.sales.get(sale.id)).paymentPending).toBeUndefined()
})

test('a payment changed while the bill was on its way is not lost', async () => {
  const sale = await sellItem(await makeItem(), 2)
  const api = fakeApi(async (ops) => {
    if (ops.some((op) => op.type === 'sale.create')) {
      await recordPayments({
        saleId: sale.id,
        payments: [{ method: 'upi', amountPaise: 119800 }],
      })
    }
    return answer(ops)
  })

  await runSync({ api })

  const saved = await db.sales.get(sale.id)
  expect(saved.syncStatus).toBe('synced')
  expect(saved.paymentPending).toBe(1)
  expect((await countPending()).payments).toBe(1)

  const next = fakeApi()
  await runSync({ api: next })
  expect(types(next)).toEqual(['sale.payment'])
  expect(allOps(next)[0].data).toMatchObject({
    rev: 1,
    payments: [{ method: 'upi', amountPaise: 119800 }],
  })
  expect((await db.sales.get(sale.id)).paymentPending).toBeUndefined()
})

test('a bill saved with no payment is sent as pending, and the payment follows later', async () => {
  const sale = await sellItem(await makeItem(), 2)
  await recordPayments({ saleId: sale.id, payments: [] }) // clears it: payment pending

  const api = fakeApi()
  await runSync({ api })

  const create = allOps(api).find((op) => op.type === 'sale.create')
  expect(create.data.payments).toEqual([])
  expect(create.data).not.toHaveProperty('payment')
})

test('a refused payment goes to needs-attention, is not sent again, and Retry sends it again', async () => {
  const { sale } = await syncedSale()
  await recordPayments({
    saleId: sale.id,
    payments: [{ method: 'cash', amountPaise: 100000 }],
  })
  const refusing = fakeApi(async (ops) =>
    answer(ops, () => ({
      status: 'rejected',
      code: 'INVALID_PAYMENT',
      message: 'Wrong payment',
    })),
  )

  const summary = await runSync({ api: refusing })

  expect(summary.rejected).toBe(1)
  const [item] = await listAttention()
  expect(item).toMatchObject({
    kind: 'salepay',
    entityId: sale.id,
    code: 'INVALID_PAYMENT',
  })
  expect(item.label).toBe(`Payment of ${sale.invoiceNumber}`)

  refusing.push.mockClear()
  await runSync({ api: refusing })
  expect(refusing.push).not.toHaveBeenCalled()

  await retryAttention(item)
  expect((await countPending()).payments).toBe(1)

  const accepting = fakeApi()
  await runSync({ api: accepting })
  expect(types(accepting)).toEqual(['sale.payment'])
  expect(await listAttention()).toHaveLength(0)
})

test('a corrected bill sends the stock put back, the new bill, then the cancellation of the old one', async () => {
  const { sale: old } = await syncedSale(2)
  const { sale: replacement } = await correctUnchanged(old, 'Wrong price')

  const api = fakeApi()
  const summary = await runSync({ api })

  expect(summary.outcome).toBe('ok')
  expect(types(api)).toEqual(['stock.movement', 'sale.create', 'sale.cancel'])
  for (const op of allOps(api))
    expect(Object.keys(op).sort()).toEqual(['data', 'type'])

  const [putBack, create, cancel] = allOps(api)
  expect(putBack.data).toMatchObject({ type: 'adjustment', quantityChange: 2 })
  expect(create.data).toMatchObject({
    id: replacement.id,
    replacesSaleId: old.id,
    replacesInvoice: old.invoiceNumber,
  })
  expect(cancel.data).toEqual({
    saleId: old.id,
    cancelledAt: expect.any(String),
    reason: 'Wrong price',
    replacedBySaleId: replacement.id,
    replacedByInvoice: replacement.invoiceNumber,
  })
  expect((await countPending()).total).toBe(0)
  expect((await db.sales.get(old.id)).cancelPending).toBeUndefined()
})

test('a bill cancelled before it was ever sent is sent first, and its cancellation follows on the next run', async () => {
  const item = await makeItem({ stock: 10 })
  const old = await sellItem(item, 2)
  await pause()
  await correctUnchanged(old)

  const first = fakeApi()
  await runSync({ api: first })
  expect(types(first).filter((t) => t === 'sale.create')).toHaveLength(2)
  expect(types(first)).not.toContain('sale.cancel')
  expect((await countPending()).cancels).toBe(1)

  const second = fakeApi()
  await runSync({ api: second })
  expect(types(second)).toEqual(['sale.cancel'])
  expect((await countPending()).total).toBe(0)
})

test('a refused cancellation goes to needs-attention, and Retry sends it again', async () => {
  const { sale } = await syncedSale()
  await correctUnchanged(sale)
  const refusing = fakeApi(async (ops) =>
    answer(ops, (op) =>
      op.type === 'sale.cancel'
        ? {
            status: 'rejected',
            code: 'SALE_MISSING',
            message: 'The bill is not on the server',
          }
        : undefined,
    ),
  )

  await runSync({ api: refusing })

  const [item] = await listAttention()
  expect(item).toMatchObject({ kind: 'salecancel', entityId: sale.id })
  expect(item.label).toBe(`Cancellation of ${sale.invoiceNumber}`)
  expect((await db.sales.get(sale.id)).cancelPending).toBeUndefined()

  refusing.push.mockClear()
  await runSync({ api: refusing })
  expect(refusing.push).not.toHaveBeenCalled()

  await retryAttention(item)
  const accepting = fakeApi()
  await runSync({ api: accepting })
  expect(types(accepting)).toEqual(['sale.cancel'])
  expect(await listAttention()).toHaveLength(0)
})

test('a temporary server error keeps the payment waiting', async () => {
  const { sale } = await syncedSale()
  await recordPayments({
    saleId: sale.id,
    payments: [{ method: 'cash', amountPaise: 100000 }],
  })
  const failing = fakeApi(async (ops) => answer(ops, () => 'error'))

  const summary = await runSync({ api: failing })

  expect(summary.outcome).toBe('server-error')
  expect((await countPending()).payments).toBe(1)
})
