import { setQuantity } from '../billing/cart'
import { AppError } from '../lib/errors'
import { newId } from '../lib/id'
import {
  clearDb,
  correctUnchanged,
  makeItem,
  sellItem,
} from '../test-utils/correctionFixtures'
import { buildCorrectionCart, correctSale } from './correctionRepo'
import { db } from './db'

beforeEach(clearDb)

const stockOf = async (item) =>
  (await db.variants.get(item.variant.id)).currentStock

test('cancels the old bill, makes a linked new bill, and fixes the stock', async () => {
  const item = await makeItem({ stock: 10 })
  const old = await sellItem(item, 2)
  expect(await stockOf(item)).toBe(8)

  const { cart } = await buildCorrectionCart(old.id)
  const smaller = setQuantity(cart, item.variant.id, 1, {
    allowNegativeStock: true,
  }).cart
  const result = await correctSale({
    oldSaleId: old.id,
    newSaleId: newId(),
    reason: 'Wrong quantity',
    cart: smaller,
    payment: { method: 'cash' },
  })

  expect(await db.sales.get(old.id)).toMatchObject({
    status: 'cancelled',
    cancelReason: 'Wrong quantity',
    replacedBySaleId: result.sale.id,
    replacedByInvoice: result.sale.invoiceNumber,
  })
  expect(result.sale).toMatchObject({
    status: 'completed',
    replacesSaleId: old.id,
    replacesInvoice: old.invoiceNumber,
  })
  expect(result.sale.invoiceNumber).not.toBe(old.invoiceNumber)
  expect(result.items[0].quantity).toBe(1)
  expect(await stockOf(item)).toBe(9)

  const movements = (await db.stockMovements.toArray()).filter(
    (m) => m.referenceId === old.id,
  )
  expect(movements.map((m) => m.quantityChange).sort((a, b) => a - b)).toEqual([
    -2, 2,
  ])
})

test('a price can be changed on the corrected bill', async () => {
  const item = await makeItem()
  const old = await sellItem(item, 1)

  const { cart } = await buildCorrectionCart(old.id)
  const cheaper = {
    ...cart,
    lines: cart.lines.map((l) => ({ ...l, unitPricePaise: 50000 })),
  }
  const result = await correctSale({
    oldSaleId: old.id,
    newSaleId: newId(),
    reason: 'Wrong price',
    cart: cheaper,
    payment: { method: 'upi', reference: 'UTR1' },
  })

  expect(result.sale.subtotalPaise).toBe(50000)
  expect(result.sale.payment.method).toBe('upi')
})

test('the draft keeps the old bill: prices, quantities and bill discount', async () => {
  const item = await makeItem()
  const old = await sellItem(item, 2, {
    billDiscount: { type: 'percent', value: 10 },
  })
  // The catalogue price changes later: the old bill must keep its own price.
  await db.variants.update(item.variant.id, {
    sellingPricePaise: 70000,
    mrpPaise: 70000,
  })

  const { sale, cart } = await buildCorrectionCart(old.id)

  expect(sale.id).toBe(old.id)
  expect(cart.billDiscount).toMatchObject({ type: 'percent', value: 10 })
  expect(cart.lines).toHaveLength(1)
  expect(cart.lines[0]).toMatchObject({
    variantId: item.variant.id,
    quantity: 2,
    unitPricePaise: 59900,
  })
})

test('if the corrected bill cannot be saved, nothing at all changes', async () => {
  const item = await makeItem({ stock: 10 })
  const old = await sellItem(item, 2)
  const movementsBefore = await db.stockMovements.count()

  const { cart } = await buildCorrectionCart(old.id)
  const tooMany = setQuantity(cart, item.variant.id, 11, {
    allowNegativeStock: true,
  }).cart

  await expect(
    correctSale({
      oldSaleId: old.id,
      newSaleId: newId(),
      reason: 'Wrong quantity',
      cart: tooMany,
      payment: { method: 'cash' },
    }),
  ).rejects.toBeInstanceOf(AppError)

  expect((await db.sales.get(old.id)).status).toBe('completed')
  expect(await stockOf(item)).toBe(8)
  expect(await db.sales.count()).toBe(1)
  expect(await db.stockMovements.count()).toBe(movementsBefore)
})

test('a bill that sold all the stock can be corrected (the old stock counts as available)', async () => {
  const item = await makeItem({ stock: 10 })
  const old = await sellItem(item, 10)
  expect(await stockOf(item)).toBe(0)

  const { cart } = await buildCorrectionCart(old.id)
  const result = await correctSale({
    oldSaleId: old.id,
    newSaleId: newId(),
    reason: 'Payment method changed',
    cart,
    payment: { method: 'upi', reference: 'UTR123' },
  })

  expect(result.sale.payment.method).toBe('upi')
  expect(await stockOf(item)).toBe(0)
})

test('a cancelled bill cannot be corrected or cancelled again', async () => {
  const item = await makeItem()
  const old = await sellItem(item, 1)
  const { cart } = await buildCorrectionCart(old.id)
  await correctUnchanged(old)

  await expect(
    correctSale({
      oldSaleId: old.id,
      newSaleId: newId(),
      reason: 'Wrong price',
      cart,
      payment: { method: 'cash' },
    }),
  ).rejects.toMatchObject({ code: 'ALREADY_CANCELLED' })
  await expect(buildCorrectionCart(old.id)).rejects.toMatchObject({
    code: 'NOT_CORRECTABLE',
  })
})

test('saving the same correction twice changes nothing the second time', async () => {
  const item = await makeItem({ stock: 10 })
  const old = await sellItem(item, 2)
  const { cart } = await buildCorrectionCart(old.id)
  const newSaleId = newId()
  const args = {
    oldSaleId: old.id,
    newSaleId,
    reason: 'Wrong price',
    cart,
    payment: { method: 'cash' },
  }

  const first = await correctSale(args)
  const again = await correctSale(args)

  expect(first.duplicate).toBe(false)
  expect(again.duplicate).toBe(true)
  expect(again.sale.id).toBe(newSaleId)
  expect(await db.sales.count()).toBe(2)
  expect(await stockOf(item)).toBe(8)
})

test('a reason is required, and an unknown bill is refused', async () => {
  const item = await makeItem()
  const old = await sellItem(item, 1)
  const { cart } = await buildCorrectionCart(old.id)

  await expect(
    correctSale({
      oldSaleId: old.id,
      newSaleId: newId(),
      reason: '  ',
      cart,
      payment: { method: 'cash' },
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  await expect(
    correctSale({
      oldSaleId: 'missing',
      newSaleId: newId(),
      reason: 'Wrong price',
      cart,
      payment: { method: 'cash' },
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })

  expect((await db.sales.get(old.id)).status).toBe('completed')
  expect(await db.sales.count()).toBe(1)
})
