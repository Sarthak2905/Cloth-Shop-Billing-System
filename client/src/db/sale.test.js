import { db } from './db'
import { createProduct, archiveProduct } from './productRepo'
import { createVariant, getVariant, updateVariant } from './variantRepo'
import { updateSettings } from './settingsRepo'
import { createSale, getSale, listSales } from './saleRepo'
import {
  addItem,
  createCart,
  lineFromVariant,
  setQuantity,
} from '../billing/cart'

const OPTS = { allowNegativeStock: true } // lets tests build carts bigger than stock

async function makeVariant(name = 'Cotton Shirt', over = {}) {
  const product = await createProduct({ name, category: 'Shirts' })
  const variant = await createVariant({
    productId: product.id,
    sku: 'SHIRT-M',
    barcode: 'CLO000001',
    size: 'M',
    costPaise: 30000,
    mrpPaise: 199900,
    sellingPricePaise: 79900,
    taxRatePercent: 5,
    openingStock: 10,
    ...over,
  })
  return { product, variant }
}

function cartOf(...entries) {
  let cart = createCart()
  for (const { product, variant, qty = 1 } of entries) {
    cart = addItem(cart, lineFromVariant(variant, product), OPTS).cart
    if (qty > 1) cart = setQuantity(cart, variant.id, qty, OPTS).cart
  }
  return cart
}

const cash = (amountTenderedPaise) => ({ method: 'cash', amountTenderedPaise })

const expectCode = (promise, code) =>
  expect(promise).rejects.toMatchObject({ code })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('saves a cash sale with invoice number, totals, payment and item snapshots', async () => {
  const entry = await makeVariant()
  const { sale, items, duplicate } = await createSale({
    id: 'sale-1',
    cart: cartOf(entry),
    payment: cash(100000),
  })

  expect(duplicate).toBe(false)
  expect(sale).toMatchObject({
    id: 'sale-1',
    invoiceNumber: 'INV-000001',
    status: 'completed',
    syncStatus: 'pending',
    itemCount: 1,
    totalPaise: 79900,
    taxPaise: 3805,
  })
  expect(sale.payment).toMatchObject({
    method: 'cash',
    amountTenderedPaise: 100000,
    changePaise: 20100,
  })
  expect(sale.shop.name).toBe('My Clothing Store')
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({
    productName: 'Cotton Shirt',
    sku: 'SHIRT-M',
    size: 'M',
    quantity: 1,
    unitPricePaise: 79900,
    taxRatePercent: 5,
    lineTotalPaise: 79900,
  })
})

test('reduces stock once and records a sale movement', async () => {
  const entry = await makeVariant()
  const { sale } = await createSale({
    id: 'sale-1',
    cart: cartOf({ ...entry, qty: 3 }),
    payment: { method: 'cash' },
  })

  expect((await getVariant(entry.variant.id)).currentStock).toBe(7)
  const movements = await db.stockMovements
    .where('type')
    .equals('sale')
    .toArray()
  expect(movements).toHaveLength(1)
  expect(movements[0]).toMatchObject({
    variantId: entry.variant.id,
    quantityChange: -3,
    stockAfter: 7,
    referenceId: sale.id,
  })
})

test('gives each sale the next invoice number and respects the prefix setting', async () => {
  const entry = await makeVariant()
  const pay = { method: 'cash' }
  const a = await createSale({ id: 'a', cart: cartOf(entry), payment: pay })
  const b = await createSale({ id: 'b', cart: cartOf(entry), payment: pay })
  await updateSettings({ invoicePrefix: 'SF' })
  const c = await createSale({ id: 'c', cart: cartOf(entry), payment: pay })

  expect(a.sale.invoiceNumber).toBe('INV-000001')
  expect(b.sale.invoiceNumber).toBe('INV-000002')
  expect(c.sale.invoiceNumber).toBe('SF-000003')
})

test('saving the same sale id twice creates only one sale and reduces stock once', async () => {
  const entry = await makeVariant()
  const request = {
    id: 'sale-1',
    cart: cartOf(entry),
    payment: { method: 'cash' },
  }

  const first = await createSale(request)
  const second = await createSale(request)

  expect(first.duplicate).toBe(false)
  expect(second.duplicate).toBe(true)
  expect(second.sale.invoiceNumber).toBe(first.sale.invoiceNumber)
  expect(await db.sales.count()).toBe(1)
  expect(await db.saleItems.count()).toBe(1)
  expect(await db.stockMovements.where('type').equals('sale').count()).toBe(1)
  expect((await getVariant(entry.variant.id)).currentStock).toBe(9)
})

test('two simultaneous requests with the same sale id still create only one sale', async () => {
  const entry = await makeVariant()
  const request = {
    id: 'sale-1',
    cart: cartOf(entry),
    payment: { method: 'cash' },
  }

  const [a, b] = await Promise.all([createSale(request), createSale(request)])

  expect(a.sale.invoiceNumber).toBe(b.sale.invoiceNumber)
  expect([a.duplicate, b.duplicate].sort()).toEqual([false, true])
  expect(await db.sales.count()).toBe(1)
  expect((await getVariant(entry.variant.id)).currentStock).toBe(9)
})

test('a failed sale changes nothing, not even the invoice number', async () => {
  const shirt = await makeVariant('Cotton Shirt')
  const jeans = await makeVariant('Denim Jeans', {
    sku: 'JEANS-32',
    barcode: 'CLO000002',
    size: '32',
    sellingPricePaise: 129900,
    openingStock: 1,
  })

  // Shirts are fine, but the jeans line asks for 2 and only 1 is in stock.
  const cart = cartOf({ ...shirt, qty: 2 }, { ...jeans, qty: 2 })
  await expectCode(
    createSale({ id: 'bad', cart, payment: { method: 'cash' } }),
    'NEGATIVE_STOCK',
  )

  expect(await db.sales.count()).toBe(0)
  expect(await db.saleItems.count()).toBe(0)
  expect(await db.stockMovements.where('type').equals('sale').count()).toBe(0)
  expect((await getVariant(shirt.variant.id)).currentStock).toBe(10)
  expect((await getVariant(jeans.variant.id)).currentStock).toBe(1)

  // The invoice number was rolled back too: the next good sale is number 1.
  const good = await createSale({
    id: 'good',
    cart: cartOf(shirt),
    payment: { method: 'cash' },
  })
  expect(good.sale.invoiceNumber).toBe('INV-000001')
})

test('rejects an empty bill', async () => {
  await expectCode(
    createSale({ id: 'x', cart: createCart(), payment: { method: 'cash' } }),
    'EMPTY_BILL',
  )
})

test('rejects cash that is less than the total and saves nothing', async () => {
  const entry = await makeVariant()
  await expectCode(
    createSale({ id: 'x', cart: cartOf(entry), payment: cash(50000) }),
    'INSUFFICIENT_PAYMENT',
  )
  expect(await db.sales.count()).toBe(0)
  expect((await getVariant(entry.variant.id)).currentStock).toBe(10)
})

test('UPI and card payments are recorded at the exact total', async () => {
  const entry = await makeVariant()
  const upi = await createSale({
    id: 'u',
    cart: cartOf(entry),
    payment: { method: 'upi', reference: 'UPI12345' },
  })
  const card = await createSale({
    id: 'c',
    cart: cartOf(entry),
    payment: { method: 'card' },
  })

  expect(upi.sale.payment).toEqual({
    method: 'upi',
    amountTenderedPaise: 79900,
    changePaise: 0,
    reference: 'UPI12345',
  })
  expect(card.sale.payment).toMatchObject({
    method: 'card',
    changePaise: 0,
    reference: '',
  })
})

test('rejects a missing or archived item', async () => {
  const entry = await makeVariant()
  const cart = cartOf(entry)

  await archiveProduct(entry.product.id)
  await expectCode(
    createSale({ id: 'a', cart, payment: { method: 'cash' } }),
    'ITEM_UNAVAILABLE',
  )

  const ghost = {
    ...cart,
    lines: [{ ...cart.lines[0], variantId: 'does-not-exist' }],
  }
  await expectCode(
    createSale({ id: 'b', cart: ghost, payment: { method: 'cash' } }),
    'ITEM_UNAVAILABLE',
  )
  expect(await db.sales.count()).toBe(0)
})

test('a saved sale keeps the price it had even if the product price changes later', async () => {
  const entry = await makeVariant()
  const { sale } = await createSale({
    id: 'sale-1',
    cart: cartOf(entry),
    payment: { method: 'cash' },
  })

  await updateVariant(entry.variant.id, { sellingPricePaise: 50000 })

  const saved = await getSale(sale.id)
  expect(saved.items[0].unitPricePaise).toBe(79900)
  expect(saved.sale.totalPaise).toBe(79900)
})

test('getSale and listSales return saved sales, newest first', async () => {
  const entry = await makeVariant()
  const pay = { method: 'cash' }
  await createSale({ id: 'a', cart: cartOf(entry), payment: pay })
  await wait(5)
  await createSale({ id: 'b', cart: cartOf(entry), payment: pay })
  await wait(5)
  await createSale({ id: 'c', cart: cartOf(entry), payment: pay })

  const all = await listSales()
  expect(all.map((s) => s.invoiceNumber)).toEqual([
    'INV-000003',
    'INV-000002',
    'INV-000001',
  ])
  expect(await listSales({ limit: 2 })).toHaveLength(2)

  expect((await getSale('b')).sale.invoiceNumber).toBe('INV-000002')
  expect(await getSale('missing')).toBeNull()
})

test('a sale can take stock below zero when that setting is on', async () => {
  const entry = await makeVariant('Cotton Shirt', { openingStock: 1 })
  await updateSettings({ allowNegativeStock: true })

  await createSale({
    id: 'sale-1',
    cart: cartOf({ ...entry, qty: 3 }),
    payment: { method: 'cash' },
  })

  expect((await getVariant(entry.variant.id)).currentStock).toBe(-2)
})
