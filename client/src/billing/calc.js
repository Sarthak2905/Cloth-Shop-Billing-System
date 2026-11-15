// All amounts are integer paise. Percentages and tax rates are converted to
// basis points (1% = 100 bp) so no floating-point money is ever used.

// Integer division rounded half-up. Only for non-negative numbers.
export function divRound(numerator, denominator) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

const toBasisPoints = (percent) => Math.round(percent * 100)

// Splits `totalPaise` across `weights` in proportion, with no paisa lost:
// every share is rounded down, then the leftover paise go to the largest
// remainders. The shares always add up to exactly `totalPaise`.
export function allocateProportionally(totalPaise, weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (totalPaise <= 0 || sum <= 0) return weights.map(() => 0)

  const total = BigInt(totalPaise)
  const weightSum = BigInt(sum)
  const shares = weights.map((w) => Number((total * BigInt(w)) / weightSum))
  const remainders = weights.map((w, index) => ({
    index,
    remainder: (total * BigInt(w)) % weightSum,
  }))

  const leftover = totalPaise - shares.reduce((a, b) => a + b, 0)
  remainders.sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index
    return a.remainder > b.remainder ? -1 : 1
  })
  for (let k = 0; k < leftover; k += 1) shares[remainders[k].index] += 1
  return shares
}

// A discount is { type: 'percent', value: 10 } or { type: 'amount', value: 10000 }
// (amount is in paise). The result can never exceed the amount it applies to.
export function discountAmount(discount, basePaise) {
  if (!discount || basePaise <= 0) return 0
  if (discount.type === 'percent') {
    return divRound(basePaise * toBasisPoints(discount.value), 10000)
  }
  return Math.min(discount.value, basePaise)
}

// A line can take a BILL discount unless its product does not allow discounts, or
// the cashier switched discounts off for it on this bill.
export function isDiscountEligible(line) {
  return line.discountAllowed !== false && line.discountExcluded !== true
}

export function calculateTotals(cart, { roundToRupee = true } = {}) {
  const base = cart.lines.map((line) => {
    const grossPaise = line.unitPricePaise * line.quantity
    const lineDiscountPaise = discountAmount(line.discount, grossPaise)
    return {
      line,
      grossPaise,
      lineDiscountPaise,
      afterItemPaise: grossPaise - lineDiscountPaise,
      eligible: isDiscountEligible(line),
    }
  })

  // The bill discount is worked out on the eligible items only, and shared among them.
  const eligibleBasePaise = base.reduce(
    (sum, b) => (b.eligible ? sum + b.afterItemPaise : sum),
    0,
  )
  const billDiscountPaise = discountAmount(cart.billDiscount, eligibleBasePaise)
  const shares = allocateProportionally(
    billDiscountPaise,
    base.map((b) => (b.eligible ? b.afterItemPaise : 0)),
  )

  const lines = base.map((b, i) => {
    const netPaise = b.afterItemPaise - shares[i]
    const bp = toBasisPoints(b.line.taxRatePercent ?? 0)
    const taxIncluded = b.line.priceIncludesTax ?? true

    let taxPaise
    let taxableValuePaise
    let lineTotalPaise
    if (taxIncluded) {
      taxPaise = divRound(netPaise * bp, 10000 + bp)
      taxableValuePaise = netPaise - taxPaise
      lineTotalPaise = netPaise
    } else {
      taxPaise = divRound(netPaise * bp, 10000)
      taxableValuePaise = netPaise
      lineTotalPaise = netPaise + taxPaise
    }

    return {
      variantId: b.line.variantId,
      quantity: b.line.quantity,
      unitPricePaise: b.line.unitPricePaise,
      grossPaise: b.grossPaise,
      lineDiscountPaise: b.lineDiscountPaise,
      billDiscountSharePaise: shares[i],
      discountEligible: b.eligible,
      netPaise,
      taxableValuePaise,
      taxPaise,
      taxIncluded,
      lineTotalPaise,
    }
  })

  const sum = (key) => lines.reduce((total, l) => total + l[key], 0)
  const taxPaise = sum('taxPaise')
  const taxIncludedPaise = lines
    .filter((l) => l.taxIncluded)
    .reduce((total, l) => total + l.taxPaise, 0)
  const exactTotalPaise = sum('lineTotalPaise')
  const totalPaise = roundToRupee
    ? divRound(exactTotalPaise, 100) * 100
    : exactTotalPaise

  return {
    lines,
    itemCount: lines.reduce((total, l) => total + l.quantity, 0),
    subtotalPaise: sum('grossPaise'),
    itemDiscountPaise: sum('lineDiscountPaise'),
    eligibleBasePaise,
    billDiscountPaise,
    discountPaise: sum('lineDiscountPaise') + billDiscountPaise,
    taxableValuePaise: sum('taxableValuePaise'),
    taxPaise,
    taxIncludedPaise,
    taxAddedPaise: taxPaise - taxIncludedPaise,
    exactTotalPaise,
    roundOffPaise: totalPaise - exactTotalPaise,
    totalPaise,
  }
}
