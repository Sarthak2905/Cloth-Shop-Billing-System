import {
  addItem,
  createCart,
  lineFromVariant,
  removeItem,
  setBillDiscount,
  setLineDiscount,
  setQuantity,
} from './cart'

const product = { id: 'p1', name: 'Cotton Shirt' }

const variant = (over = {}) => ({
  id: 'v1',
  sku: 'SHIRT-M',
  barcode: 'CLO000001',
  size: 'M',
  sellingPricePaise: 79900,
  mrpPaise: 99900,
  taxRatePercent: 5,
  priceIncludesTax: true,
  currentStock: 5,
  ...over,
})

const cartWith = (v = variant()) =>
  addItem(createCart(), lineFromVariant(v, product)).cart

test('adds an item with a snapshot of its details', () => {
  const { cart, error } = addItem(
    createCart(),
    lineFromVariant(variant(), product),
  )
  expect(error).toBeNull()
  expect(cart.lines).toHaveLength(1)
  expect(cart.lines[0]).toMatchObject({
    productName: 'Cotton Shirt',
    size: 'M',
    unitPricePaise: 79900,
    taxRatePercent: 5,
    quantity: 1,
  })
})

test('adding the same item again increases its quantity', () => {
  const first = cartWith()
  const { cart } = addItem(first, lineFromVariant(variant(), product))
  expect(cart.lines).toHaveLength(1)
  expect(cart.lines[0].quantity).toBe(2)
})

test('blocks adding more than the stock', () => {
  let cart = cartWith(variant({ currentStock: 2 }))
  cart = addItem(
    cart,
    lineFromVariant(variant({ currentStock: 2 }), product),
  ).cart
  const result = addItem(
    cart,
    lineFromVariant(variant({ currentStock: 2 }), product),
  )
  expect(result.error).toBe('Only 2 in stock')
  expect(result.cart.lines[0].quantity).toBe(2)
})

test('blocks adding an out-of-stock item', () => {
  const result = addItem(
    createCart(),
    lineFromVariant(variant({ currentStock: 0 }), product),
  )
  expect(result.error).toBe('Out of stock')
  expect(result.cart.lines).toHaveLength(0)
})

test('allows going over stock when negative stock is allowed', () => {
  const v = variant({ currentStock: 0 })
  const result = addItem(createCart(), lineFromVariant(v, product), {
    allowNegativeStock: true,
  })
  expect(result.error).toBeNull()
  expect(result.cart.lines[0].quantity).toBe(1)
})

test('setQuantity changes the quantity and 0 removes the line', () => {
  const cart = cartWith()
  const changed = setQuantity(cart, 'v1', 3)
  expect(changed.cart.lines[0].quantity).toBe(3)
  const removed = setQuantity(changed.cart, 'v1', 0)
  expect(removed.cart.lines).toHaveLength(0)
})

test('setQuantity rejects invalid numbers and quantities above stock', () => {
  const cart = cartWith()
  expect(setQuantity(cart, 'v1', 1.5).error).toBe(
    'Quantity must be a whole number',
  )
  expect(setQuantity(cart, 'v1', -1).error).toBe(
    'Quantity must be a whole number',
  )
  expect(setQuantity(cart, 'v1', 6).error).toBe('Only 5 in stock')
  expect(setQuantity(cart, 'missing', 1).error).toBe('Item is not in the bill')
})

test('removeItem removes a line', () => {
  const cart = removeItem(cartWith(), 'v1').cart
  expect(cart.lines).toHaveLength(0)
})

test('accepts valid line discounts and rejects invalid ones', () => {
  const cart = cartWith()
  const pct = setLineDiscount(cart, 'v1', { type: 'percent', value: 10 })
  expect(pct.error).toBeNull()
  expect(pct.cart.lines[0].discount).toEqual({ type: 'percent', value: 10 })

  expect(
    setLineDiscount(cart, 'v1', { type: 'percent', value: 150 }).error,
  ).toBe('Percent must be between 0 and 100')
  expect(
    setLineDiscount(cart, 'v1', { type: 'amount', value: 999999 }).error,
  ).toBe('Discount cannot be more than the item total')
  expect(
    setLineDiscount(cart, 'v1', { type: 'amount', value: 10.5 }).error,
  ).toBe('Enter a valid discount amount')
  expect(
    setLineDiscount(pct.cart, 'v1', null).cart.lines[0].discount,
  ).toBeNull()
})

test('sets and clears a bill discount', () => {
  const cart = cartWith()
  const on = setBillDiscount(cart, { type: 'percent', value: 10 })
  expect(on.cart.billDiscount).toEqual({ type: 'percent', value: 10 })
  expect(setBillDiscount(on.cart, null).cart.billDiscount).toBeNull()
  expect(
    setBillDiscount(on.cart, { type: 'percent', value: 0 }).cart.billDiscount,
  ).toBeNull()
  expect(setBillDiscount(cart, { type: 'amount', value: 9999999 }).error).toBe(
    'Discount cannot be more than the bill total',
  )
})

test('a snapshot does not change when the product price changes later', () => {
  const v = variant()
  const cart = addItem(createCart(), lineFromVariant(v, product)).cart
  v.sellingPricePaise = 1
  expect(cart.lines[0].unitPricePaise).toBe(79900)
})
