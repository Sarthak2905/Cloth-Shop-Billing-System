import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import {
  clearDb,
  correctUnchanged,
  makeItem,
} from '../test-utils/correctionFixtures'
import { db } from './db'
import { countPendingPayments, recordPayments } from './paymentRepo'
import { createSale, getSale } from './saleRepo'

beforeEach(clearDb)

// Two pieces of a ₹510 item = a ₹1,020 bill.
async function twoPieces(over = {}) {
  const { product, variant } = await makeItem({ price: 51000, ...over })
  let cart = createCart()
  cart = addItem(cart, lineFromVariant(variant, product)).cart
  cart = addItem(cart, lineFromVariant(variant, product)).cart
  return { cart, variant }
}

test('a bill without any payment is saved as payment pending, and its stock is still taken', async () => {
  const { cart, variant } = await twoPieces()

  const { sale } = await createSale({ id: newId(), cart })

  expect(sale).toMatchObject({
    totalPaise: 102000,
    paymentStatus: 'pending',
    receivedPaise: 0,
    shortPaise: 102000,
    paymentRecordedAt: null,
    invoiceNumber: 'INV-000001',
  })
  expect(sale.payment.method).toBe('pending')
  expect(sale.payments).toEqual([])
  expect((await db.variants.get(variant.id)).currentStock).toBe(8)
})

test('half cash and half UPI is saved as a split payment', async () => {
  const { cart } = await twoPieces()

  const { sale } = await createSale({
    id: newId(),
    cart,
    payments: [
      { method: 'cash', amountPaise: 50000 },
      { method: 'upi', amountPaise: 52000, reference: 'T9' },
    ],
  })

  expect(sale).toMatchObject({
    paymentStatus: 'paid',
    receivedPaise: 102000,
    shortPaise: 0,
  })
  expect(sale.payment).toMatchObject({
    method: 'split',
    amountTenderedPaise: 102000,
    changePaise: 0,
  })
  expect(sale.payments).toHaveLength(2)
})

test('a bargain: the customer pays less, and the short amount is kept', async () => {
  const { cart } = await twoPieces()

  const { sale } = await createSale({
    id: newId(),
    cart,
    payments: [{ method: 'cash', amountPaise: 100000 }],
  })

  expect(sale).toMatchObject({
    paymentStatus: 'paid',
    receivedPaise: 100000,
    shortPaise: 2000,
    totalPaise: 102000,
  })
})

test('extra cash gives change, but extra UPI is refused and nothing is saved', async () => {
  const first = await twoPieces({ barcode: 'BC-0010', sku: 'S10' })
  const { sale } = await createSale({
    id: newId(),
    cart: first.cart,
    payments: [{ method: 'cash', amountPaise: 110000 }],
  })
  expect(sale.payment.changePaise).toBe(8000)

  const second = await twoPieces({
    name: 'Other',
    barcode: 'BC-0011',
    sku: 'S11',
  })
  await expect(
    createSale({
      id: newId(),
      cart: second.cart,
      payments: [{ method: 'upi', amountPaise: 110000 }],
    }),
  ).rejects.toMatchObject({ code: 'INVALID_PAYMENT' })

  expect(await db.sales.count()).toBe(1)
  expect((await db.variants.get(second.variant.id)).currentStock).toBe(10)
})

test('the older way of paying still works, including the cash check', async () => {
  const { cart } = await twoPieces()

  const { sale } = await createSale({
    id: newId(),
    cart,
    payment: { method: 'cash', amountTenderedPaise: 110000 },
  })
  expect(sale.payment).toEqual({
    method: 'cash',
    amountTenderedPaise: 110000,
    changePaise: 8000,
    reference: '',
  })
  expect(sale.paymentStatus).toBe('paid')

  const other = await twoPieces({
    name: 'Other',
    barcode: 'BC-0012',
    sku: 'S12',
  })
  await expect(
    createSale({
      id: newId(),
      cart: other.cart,
      payment: { method: 'cash', amountTenderedPaise: 1000 },
    }),
  ).rejects.toMatchObject({ code: 'INSUFFICIENT_PAYMENT' })
})

test('the payment can be recorded later, changed, and cleared', async () => {
  const { cart } = await twoPieces()
  const { sale } = await createSale({ id: newId(), cart })

  const paid = await recordPayments({
    saleId: sale.id,
    payments: [{ method: 'cash', amountPaise: 100000 }],
  })
  expect(paid).toMatchObject({
    paymentStatus: 'paid',
    receivedPaise: 100000,
    shortPaise: 2000,
  })
  expect(paid.paymentRecordedAt).not.toBeNull()

  await recordPayments({
    saleId: sale.id,
    payments: [
      { method: 'cash', amountPaise: 50000 },
      { method: 'upi', amountPaise: 52000 },
    ],
  })
  const stored = (await getSale(sale.id)).sale
  expect(stored).toMatchObject({ receivedPaise: 102000, shortPaise: 0 })
  expect(stored.payment.method).toBe('split')

  await recordPayments({ saleId: sale.id, payments: [] })
  expect((await getSale(sale.id)).sale).toMatchObject({
    paymentStatus: 'pending',
    paymentRecordedAt: null,
  })
})

test('recording a payment never changes the items, the total or the stock', async () => {
  const { cart, variant } = await twoPieces()
  const { sale, items } = await createSale({ id: newId(), cart })

  await recordPayments({
    saleId: sale.id,
    payments: [{ method: 'cash', amountPaise: 102000 }],
  })

  const after = await getSale(sale.id)
  expect(after.sale.totalPaise).toBe(sale.totalPaise)
  expect(after.items).toEqual(items)
  expect((await db.variants.get(variant.id)).currentStock).toBe(8)
})

test('a wrong payment, an unknown bill and a cancelled bill are refused', async () => {
  const { cart } = await twoPieces()
  const { sale } = await createSale({ id: newId(), cart })

  await expect(
    recordPayments({
      saleId: sale.id,
      payments: [{ method: 'upi', amountPaise: 999999 }],
    }),
  ).rejects.toMatchObject({ code: 'INVALID_PAYMENT' })
  expect((await getSale(sale.id)).sale.paymentStatus).toBe('pending')

  await expect(
    recordPayments({ saleId: 'missing', payments: [] }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })

  await correctUnchanged(sale)
  await expect(
    recordPayments({ saleId: sale.id, payments: [] }),
  ).rejects.toMatchObject({ code: 'NOT_PAYABLE' })
})

test('only bills that are really waiting for payment are counted', async () => {
  const one = await twoPieces({ barcode: 'BC-0020', sku: 'S20' })
  const two = await twoPieces({ name: 'Two', barcode: 'BC-0021', sku: 'S21' })
  const a = (await createSale({ id: newId(), cart: one.cart })).sale
  const b = (await createSale({ id: newId(), cart: two.cart })).sale
  expect(await countPendingPayments()).toBe(2)

  await recordPayments({
    saleId: a.id,
    payments: [{ method: 'cash', amountPaise: 102000 }],
  })
  expect(await countPendingPayments()).toBe(1)

  await correctUnchanged(b) // b is cancelled, the new bill is paid
  expect(await countPendingPayments()).toBe(0)
})
