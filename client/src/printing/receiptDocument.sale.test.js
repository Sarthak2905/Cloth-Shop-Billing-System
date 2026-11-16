import {
  addItem,
  createCart,
  lineFromVariant,
  setBillDiscount,
} from '../billing/cart'
import { db } from '../db/db'
import { createProduct } from '../db/productRepo'
import { createSale } from '../db/saleRepo'
import { createVariant } from '../db/variantRepo'
import { newId } from '../lib/id'
import { buildReceiptDocument } from './receiptDocument'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function makeItem({
  name,
  price,
  unit = 'piece',
  discountAllowed = true,
  stock = 10,
}) {
  const product = await createProduct({
    name,
    category: 'Test',
    discountAllowed,
  })
  const variant = await createVariant({
    productId: product.id,
    size: '',
    unit,
    costPaise: 0,
    mrpPaise: price,
    sellingPricePaise: price,
    taxRatePercent: 5,
    priceIncludesTax: true,
    openingStock: stock,
    reorderThreshold: 0,
  })
  return { product, variant }
}

async function sellWithTenPercent(order) {
  let cart = createCart()
  for (const { product, variant } of order) {
    cart = addItem(cart, lineFromVariant(variant, product)).cart
  }
  cart = setBillDiscount(cart, { type: 'percent', value: 10 }).cart
  return createSale({ id: newId(), cart, payment: { method: 'cash' } })
}

const outline = (doc) => {
  const all = doc.blocks
    .filter((b) => b.kind === 'row' || b.kind === 'text')
    .map((b) => (b.kind === 'text' ? b.text : `${b.left} | ${b.right}`))
  return all.slice(all.indexOf('Item | Amount (Rs)'))
}

const EXPECTED = [
  'Item | Amount (Rs)',
  'Shirt',
  '1 x 280.00 | 280.00',
  'Pant',
  '1 x 220.00 | 220.00',
  'Subtotal (2) | 500.00',
  'Discount | -50.00',
  'After discount | 450.00',
  'Astar',
  '1.00 m x 35.00 | 35.00',
  'TOTAL | 485.00',
]

test('a real bill: shirt and pant with 10% off, then the lining without a discount', async () => {
  const shirt = await makeItem({ name: 'Shirt', price: 28000 })
  const pant = await makeItem({ name: 'Pant', price: 22000 })
  const lining = await makeItem({
    name: 'Astar',
    price: 3500,
    unit: 'meter',
    discountAllowed: false,
    stock: 2550,
  })

  const { sale, items } = await sellWithTenPercent([shirt, pant, lining])

  expect(sale).toMatchObject({ billDiscountPaise: 5000, totalPaise: 48500 })
  expect(outline(buildReceiptDocument(sale, items)).slice(0, 11)).toEqual(
    EXPECTED,
  )
})

test('the same bill typed with the lining first prints the same way', async () => {
  const shirt = await makeItem({ name: 'Shirt', price: 28000 })
  const pant = await makeItem({ name: 'Pant', price: 22000 })
  const lining = await makeItem({
    name: 'Astar',
    price: 3500,
    unit: 'meter',
    discountAllowed: false,
    stock: 2550,
  })

  const { sale, items } = await sellWithTenPercent([lining, shirt, pant])

  expect(outline(buildReceiptDocument(sale, items)).slice(0, 11)).toEqual(
    EXPECTED,
  )
})

test('a bill with no discount at all stays a plain list', async () => {
  const shirt = await makeItem({ name: 'Shirt', price: 28000 })
  const lining = await makeItem({
    name: 'Astar',
    price: 3500,
    unit: 'meter',
    discountAllowed: false,
    stock: 2550,
  })
  let cart = createCart()
  for (const { product, variant } of [shirt, lining]) {
    cart = addItem(cart, lineFromVariant(variant, product)).cart
  }
  const { sale, items } = await createSale({
    id: newId(),
    cart,
    payment: { method: 'cash' },
  })

  const text = outline(buildReceiptDocument(sale, items)).join('\n')

  expect(text).toContain('Subtotal (2) | 315.00')
  expect(text).not.toContain('After discount')
})
