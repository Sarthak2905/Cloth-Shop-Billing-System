import {
  allocateProportionally,
  calculateTotals,
  discountAmount,
  divRound,
} from './calc'

// Builds a cart line with sensible defaults.
const line = (over = {}) => ({
  variantId: 'v1',
  unitPricePaise: 79900,
  quantity: 1,
  taxRatePercent: 5,
  priceIncludesTax: true,
  discount: null,
  ...over,
})

const cartOf = (lines, billDiscount = null) => ({ lines, billDiscount })

test('an empty bill totals zero', () => {
  const t = calculateTotals(cartOf([]))
  expect(t.totalPaise).toBe(0)
  expect(t.subtotalPaise).toBe(0)
  expect(t.itemCount).toBe(0)
})

test('tax-inclusive price: the tax is extracted from the price', () => {
  const one = calculateTotals(cartOf([line()]))
  expect(one.subtotalPaise).toBe(79900)
  expect(one.taxPaise).toBe(3805) // 79900 x 5 / 105 = 38.0476 rupees -> 3805 paise
  expect(one.taxableValuePaise).toBe(76095)
  expect(one.totalPaise).toBe(79900)

  const two = calculateTotals(cartOf([line({ quantity: 2 })]))
  expect(two.taxPaise).toBe(7610)
  expect(two.totalPaise).toBe(159800)
})

test('tax-exclusive price: the tax is added on top', () => {
  const t = calculateTotals(
    cartOf([
      line({
        unitPricePaise: 10000,
        taxRatePercent: 18,
        priceIncludesTax: false,
      }),
    ]),
  )
  expect(t.taxAddedPaise).toBe(1800)
  expect(t.taxIncludedPaise).toBe(0)
  expect(t.totalPaise).toBe(11800)
})

test('a 10% bill discount reduces the tax and rounds the total to the rupee', () => {
  const t = calculateTotals(cartOf([line()], { type: 'percent', value: 10 }))
  expect(t.billDiscountPaise).toBe(7990)
  expect(t.taxPaise).toBe(3424)
  expect(t.exactTotalPaise).toBe(71910)
  expect(t.totalPaise).toBe(71900)
  expect(t.roundOffPaise).toBe(-10)
})

test('a 10% item discount on one item matches a 10% bill discount', () => {
  const viaItem = calculateTotals(
    cartOf([line({ discount: { type: 'percent', value: 10 } })]),
  )
  const viaBill = calculateTotals(
    cartOf([line()], { type: 'percent', value: 10 }),
  )
  expect(viaItem.itemDiscountPaise).toBe(7990)
  expect(viaItem.totalPaise).toBe(viaBill.totalPaise)
  expect(viaItem.taxPaise).toBe(viaBill.taxPaise)
})

test('a fixed amount discount', () => {
  const t = calculateTotals(cartOf([line()], { type: 'amount', value: 10000 }))
  expect(t.discountPaise).toBe(10000)
  expect(t.exactTotalPaise).toBe(69900)
  expect(t.taxPaise).toBe(3329)
  expect(t.totalPaise).toBe(69900)
})

test('the bill discount is shared across lines without losing a paisa', () => {
  const t = calculateTotals(
    cartOf(
      [
        line({ variantId: 'a', unitPricePaise: 33333 }),
        line({ variantId: 'b', unitPricePaise: 66667 }),
        line({ variantId: 'c', unitPricePaise: 12345, quantity: 3 }),
      ],
      { type: 'percent', value: 7.5 },
    ),
  )
  const shared = t.lines.reduce((sum, l) => sum + l.billDiscountSharePaise, 0)
  expect(shared).toBe(t.billDiscountPaise)
  expect(t.billDiscountPaise).toBeGreaterThan(0)
})

test('rounding goes to the nearest rupee and halves round up', () => {
  const up = calculateTotals(
    cartOf([line({ unitPricePaise: 10050, taxRatePercent: 0 })]),
  )
  expect(up.totalPaise).toBe(10100)
  expect(up.roundOffPaise).toBe(50)

  const down = calculateTotals(
    cartOf([line({ unitPricePaise: 10049, taxRatePercent: 0 })]),
  )
  expect(down.totalPaise).toBe(10000)
  expect(down.roundOffPaise).toBe(-49)
})

test('rounding can be switched off', () => {
  const t = calculateTotals(
    cartOf([line({ unitPricePaise: 10050, taxRatePercent: 0 })]),
    {
      roundToRupee: false,
    },
  )
  expect(t.totalPaise).toBe(10050)
  expect(t.roundOffPaise).toBe(0)
})

test('a discount larger than the bill is capped at the bill value', () => {
  const t = calculateTotals(
    cartOf([line()], { type: 'amount', value: 9999999 }),
  )
  expect(t.billDiscountPaise).toBe(79900)
  expect(t.totalPaise).toBe(0)
  expect(discountAmount({ type: 'percent', value: 100 }, 5000)).toBe(5000)
  expect(discountAmount(null, 5000)).toBe(0)
})

test('totals add up for many price, quantity and discount combinations', () => {
  const prices = [1, 99, 19900, 79900, 129900, 99999]
  const discounts = [
    null,
    { type: 'percent', value: 10 },
    { type: 'percent', value: 12.5 },
    { type: 'amount', value: 1234 },
  ]
  const rates = [0, 5, 12, 18]

  for (const price of prices) {
    for (const bill of discounts) {
      for (const rate of rates) {
        for (const included of [true, false]) {
          const t = calculateTotals(
            cartOf(
              [
                line({
                  variantId: 'a',
                  unitPricePaise: price,
                  taxRatePercent: rate,
                  priceIncludesTax: included,
                }),
                line({
                  variantId: 'b',
                  unitPricePaise: 4999,
                  quantity: 3,
                  taxRatePercent: rate,
                  priceIncludesTax: included,
                  discount: { type: 'percent', value: 5 },
                }),
              ],
              bill,
            ),
          )
          // Subtotal - discounts + tax added = exact total, to the paisa.
          expect(t.subtotalPaise - t.discountPaise + t.taxAddedPaise).toBe(
            t.exactTotalPaise,
          )
          // The rounded total differs from the exact one by less than a rupee.
          expect(Math.abs(t.roundOffPaise)).toBeLessThanOrEqual(50)
          expect(t.totalPaise % 100).toBe(0)
          expect(t.totalPaise).toBeGreaterThanOrEqual(0)
        }
      }
    }
  }
})

test('allocateProportionally splits exactly and hands out leftover paise', () => {
  expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33])
  expect(allocateProportionally(1000, [3000, 7000])).toEqual([300, 700])
  expect(allocateProportionally(0, [5, 5])).toEqual([0, 0])
  expect(allocateProportionally(50, [0, 0])).toEqual([0, 0])
  expect(divRound(10050, 100)).toBe(101)
  expect(divRound(10049, 100)).toBe(100)
})
