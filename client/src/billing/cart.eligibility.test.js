import {
  addItem,
  createCart,
  lineFromVariant,
  setBillDiscount,
  setLineDiscount,
  setLineDiscountExcluded,
} from './cart'

const variant = (over = {}) => ({
  id: 'v1',
  sku: 'JEANS-32',
  barcode: 'CLO000002',
  size: '32',
  sellingPricePaise: 129900,
  mrpPaise: 159900,
  taxRatePercent: 5,
  priceIncludesTax: true,
  currentStock: 5,
  ...over,
})
const product = (over = {}) => ({ id: 'p1', name: 'Denim Jeans', ...over })

const cartWith = (...entries) =>
  entries.reduce(
    (cart, [v, p]) => addItem(cart, lineFromVariant(v, p)).cart,
    createCart(),
  )

const TEN = { type: 'percent', value: 10 }

test('a line remembers whether its product allows discounts', () => {
  const blocked = lineFromVariant(
    variant(),
    product({ discountAllowed: false }),
  )
  expect(blocked.discountAllowed).toBe(false)
  expect(blocked.discountExcluded).toBe(false)

  expect(lineFromVariant(variant(), product()).discountAllowed).toBe(true)
  expect(
    lineFromVariant(variant(), product({ discountAllowed: true }))
      .discountAllowed,
  ).toBe(true)
})

test('an item discount is refused on a product that does not allow discounts, or on a line switched off', () => {
  const blocked = cartWith([variant(), product({ discountAllowed: false })])
  expect(setLineDiscount(blocked, 'v1', TEN).error).toBe(
    'This product does not allow discounts',
  )

  const normal = cartWith([variant(), product()])
  const switchedOff = setLineDiscountExcluded(normal, 'v1', true).cart
  expect(setLineDiscount(switchedOff, 'v1', TEN).error).toBe(
    'Discount is switched off for this item',
  )
})

test('switching an item off removes its discount, and it can be switched back on unless the product forbids discounts', () => {
  const normal = cartWith([variant(), product()])
  const withDiscount = setLineDiscount(normal, 'v1', TEN).cart

  const off = setLineDiscountExcluded(withDiscount, 'v1', true).cart
  expect(off.lines[0]).toMatchObject({ discountExcluded: true, discount: null })

  const on = setLineDiscountExcluded(off, 'v1', false).cart
  expect(on.lines[0].discountExcluded).toBe(false)

  const blocked = cartWith([variant(), product({ discountAllowed: false })])
  expect(setLineDiscountExcluded(blocked, 'v1', false).error).toBe(
    'This product does not allow discounts',
  )
  expect(setLineDiscountExcluded(normal, 'missing', true).error).toBe(
    'Item is not in the bill',
  )
})

test('a bill discount needs at least one item that can take it, and is capped to those items', () => {
  const onlyBlocked = cartWith([variant(), product({ discountAllowed: false })])
  expect(setBillDiscount(onlyBlocked, TEN).error).toBe(
    'No item on this bill can take a discount',
  )

  const mixed = cartWith(
    [variant({ id: 'v1', sellingPricePaise: 79900 }), product()],
    [
      variant({ id: 'v2', sku: 'J2', sellingPricePaise: 129900 }),
      product({ id: 'p2', discountAllowed: false }),
    ],
  )
  expect(setBillDiscount(mixed, TEN).error).toBeNull()
  expect(setBillDiscount(mixed, { type: 'amount', value: 79901 }).error).toBe(
    'Discount cannot be more than the bill total',
  )
  expect(
    setBillDiscount(mixed, { type: 'amount', value: 79900 }).error,
  ).toBeNull()
})
