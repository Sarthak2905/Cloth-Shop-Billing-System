import { calculateTotals, isDiscountEligible } from './calc'

const line = (over = {}) => ({
  variantId: 'a',
  unitPricePaise: 79900,
  quantity: 1,
  taxRatePercent: 5,
  priceIncludesTax: true,
  discount: null,
  ...over,
})
const cart = (lines, billDiscount = null) => ({ lines, billDiscount })
const TEN = { type: 'percent', value: 10 }

test('a bill discount applies only to items that allow discounts', () => {
  const t = calculateTotals(
    cart(
      [
        line({ variantId: 'a' }),
        line({ variantId: 'b', unitPricePaise: 129900 }),
        line({ variantId: 'c', unitPricePaise: 49900, discountAllowed: false }),
      ],
      TEN,
    ),
  )

  expect(t.eligibleBasePaise).toBe(209800)
  expect(t.billDiscountPaise).toBe(20980)
  expect(t.lines.map((l) => l.billDiscountSharePaise)).toEqual([7990, 12990, 0])
  expect(t.lines.map((l) => l.discountEligible)).toEqual([true, true, false])
  expect(t.subtotalPaise).toBe(259700)
  expect(t.exactTotalPaise).toBe(238720)
  expect(t.totalPaise).toBe(238700)
})

test('an item switched off for this bill is left out of the bill discount too', () => {
  const t = calculateTotals(
    cart(
      [
        line({ variantId: 'a' }),
        line({
          variantId: 'b',
          unitPricePaise: 129900,
          discountExcluded: true,
        }),
      ],
      TEN,
    ),
  )

  expect(t.eligibleBasePaise).toBe(79900)
  expect(t.billDiscountPaise).toBe(7990)
  expect(t.lines[1].billDiscountSharePaise).toBe(0)
})

test('with no eligible items the bill discount is zero', () => {
  const t = calculateTotals(cart([line({ discountAllowed: false })], TEN))

  expect(t.eligibleBasePaise).toBe(0)
  expect(t.billDiscountPaise).toBe(0)
  expect(t.totalPaise).toBe(79900)

  expect(isDiscountEligible({})).toBe(true)
  expect(isDiscountEligible({ discountAllowed: false })).toBe(false)
  expect(isDiscountEligible({ discountExcluded: true })).toBe(false)
})

test('the shares still add up to the discount exactly, and ineligible items get none', () => {
  const t = calculateTotals(
    cart(
      [
        line({ variantId: 'a', unitPricePaise: 33333 }),
        line({ variantId: 'b', unitPricePaise: 66667 }),
        line({ variantId: 'c', unitPricePaise: 12345, quantity: 3 }),
        line({ variantId: 'd', unitPricePaise: 99999, discountAllowed: false }),
      ],
      { type: 'amount', value: 1234 },
    ),
  )

  const shares = t.lines.map((l) => l.billDiscountSharePaise)
  expect(shares.reduce((a, b) => a + b, 0)).toBe(1234)
  expect(shares[3]).toBe(0)
})

test('item discounts are applied as given and reduce what the bill discount is calculated on', () => {
  const t = calculateTotals(
    cart(
      [
        line({ variantId: 'a', discount: { type: 'percent', value: 10 } }),
        line({ variantId: 'b', unitPricePaise: 129900 }),
      ],
      TEN,
    ),
  )

  expect(t.itemDiscountPaise).toBe(7990)
  expect(t.eligibleBasePaise).toBe(71910 + 129900)
  expect(t.billDiscountPaise).toBe(20181)
})
