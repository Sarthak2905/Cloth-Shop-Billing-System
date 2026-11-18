import { db } from '../db/db'
import { recordPayments } from '../db/paymentRepo'
import {
  clearDb,
  correctUnchanged,
  makeItem,
  sellItem,
} from '../test-utils/correctionFixtures'
import { collectPending, countPending } from './collect'

const ofKind = (ops, kind) => ops.filter((op) => op.kind === kind)

beforeEach(clearDb)

test('a payment recorded later is collected only once its bill is on the server', async () => {
  const sale = await sellItem(await makeItem(), 2)
  await recordPayments({
    saleId: sale.id,
    payments: [{ method: 'cash', amountPaise: 100000 }],
  })

  expect(ofKind(await collectPending(), 'salepay')).toHaveLength(0) // the bill still carries it itself

  await db.sales.update(sale.id, { syncStatus: 'synced' })
  const ops = ofKind(await collectPending(), 'salepay')

  expect(ops).toHaveLength(1)
  expect(ops[0].data).toMatchObject({
    saleId: sale.id,
    rev: 1,
    payments: [{ method: 'cash', amountPaise: 100000 }],
  })
})

test('a bill whose payment never changed has no payment operation', async () => {
  const sale = await sellItem(await makeItem(), 2)
  await db.sales.update(sale.id, { syncStatus: 'synced' })

  expect(ofKind(await collectPending(), 'salepay')).toHaveLength(0)
})

test('a cancellation is collected only for a cancelled bill that is on the server', async () => {
  const old = await sellItem(await makeItem(), 1)
  await correctUnchanged(old)

  expect(ofKind(await collectPending(), 'salecancel')).toHaveLength(0) // the old bill is not on the server yet

  await db.sales.update(old.id, { syncStatus: 'synced' })
  const ops = ofKind(await collectPending(), 'salecancel')

  expect(ops).toHaveLength(1)
  expect(ops[0].data).toMatchObject({ saleId: old.id, reason: 'Wrong price' })
})

test('new bills go first, then payments, then cancellations', async () => {
  const item = await makeItem({ stock: 10 })
  const first = await sellItem(item, 1)
  const second = await sellItem(item, 1)
  await db.sales.update(first.id, { syncStatus: 'synced' })
  await db.sales.update(second.id, { syncStatus: 'synced' })
  await recordPayments({
    saleId: second.id,
    payments: [{ method: 'upi', amountPaise: 59900 }],
  })
  await correctUnchanged(first) // a new bill, and the first one is cancelled

  const kinds = (await collectPending())
    .map((op) => op.kind)
    .filter((kind) => ['sale', 'salepay', 'salecancel'].includes(kind))

  expect(kinds).toEqual(['sale', 'salepay', 'salecancel'])
})

test('the waiting count includes payments and cancellations', async () => {
  const item = await makeItem({ stock: 10 })
  const first = await sellItem(item, 1)
  const second = await sellItem(item, 1)
  await db.sales.update(first.id, { syncStatus: 'synced' })
  await db.sales.update(second.id, { syncStatus: 'synced' })
  await recordPayments({
    saleId: second.id,
    payments: [{ method: 'upi', amountPaise: 59900 }],
  })
  await correctUnchanged(first)

  const counts = await countPending()

  expect(counts).toMatchObject({ sales: 1, payments: 1, cancels: 1 })
  expect(counts.total).toBe(
    counts.products + counts.variants + counts.movements + 3,
  )
})
