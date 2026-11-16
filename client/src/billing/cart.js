import { calculateTotals, isDiscountEligible, lineGrossPaise } from './calc.js'
import { formatQuantity, stepFor } from '../lib/quantity.js'

// A cart is plain data: { lines: [...], billDiscount: null | {type, value} }.
// Every function returns { cart, error }. If error is set, the cart is unchanged.
// Meter items: quantity and stock are whole CENTIMETRES (235 = 2.35 m).

const MAX_PIECES = 9999
const MAX_METER_CM = 100000 // 1000 m on one line
const maxFor = (unit) => (unit === 'meter' ? MAX_METER_CM : MAX_PIECES)

export function createCart() {
  return { lines: [], billDiscount: null }
}

// Copies everything the bill needs, so later product edits do not change it.
export function lineFromVariant(variant, product) {
  const unit = variant.unit ?? 'piece'
  return {
    variantId: variant.id,
    productId: product.id,
    productName: product.name,
    sku: variant.sku,
    barcode: variant.barcode,
    size: variant.size,
    unit,
    unitPricePaise: variant.sellingPricePaise,
    mrpPaise: variant.mrpPaise,
    taxRatePercent: variant.taxRatePercent ?? 0,
    priceIncludesTax: variant.priceIncludesTax ?? true,
    availableStock: variant.currentStock,
    // false for products that never take a discount (older products count as allowed)
    discountAllowed: product.discountAllowed !== false,
    // true when the cashier switched discounts off for this item on this bill
    discountExcluded: false,
    // a new piece line starts at 1; a new meter line starts at 1.00 m
    quantity: stepFor(unit),
    discount: null,
  }
}

const ok = (cart) => ({ cart, error: null })
const fail = (cart, error) => ({ cart, error })

function stockError(line, quantity, allowNegativeStock) {
  if (allowNegativeStock) return null
  if (line.availableStock <= 0) return 'Out of stock'
  if (quantity > line.availableStock)
    return `Only ${formatQuantity(line.availableStock, line.unit)} in stock`
  return null
}

function updateLine(cart, variantId, changes) {
  return {
    ...cart,
    lines: cart.lines.map((l) =>
      l.variantId === variantId ? { ...l, ...changes } : l,
    ),
  }
}

export function addItem(cart, newLine, { allowNegativeStock = false } = {}) {
  const existing = cart.lines.find((l) => l.variantId === newLine.variantId)
  const step = stepFor(newLine.unit)
  const quantity = existing ? existing.quantity + step : step

  const error = stockError(existing ?? newLine, quantity, allowNegativeStock)
  if (error) return fail(cart, error)
  if (quantity > maxFor(newLine.unit))
    return fail(cart, 'Quantity is too large')

  if (existing) return ok(updateLine(cart, newLine.variantId, { quantity }))
  return ok({ ...cart, lines: [...cart.lines, { ...newLine, quantity: step }] })
}

export function removeItem(cart, variantId) {
  return ok({
    ...cart,
    lines: cart.lines.filter((l) => l.variantId !== variantId),
  })
}

export function setQuantity(
  cart,
  variantId,
  quantity,
  { allowNegativeStock = false } = {},
) {
  const line = cart.lines.find((l) => l.variantId === variantId)
  if (!line) return fail(cart, 'Item is not in the bill')
  if (!Number.isInteger(quantity) || quantity < 0) {
    return fail(cart, 'Quantity must be a whole number')
  }
  if (quantity === 0) return removeItem(cart, variantId)
  if (quantity > maxFor(line.unit)) return fail(cart, 'Quantity is too large')

  const error = stockError(line, quantity, allowNegativeStock)
  if (error) return fail(cart, error)
  return ok(updateLine(cart, variantId, { quantity }))
}

// Returns { discount, error }. null or a value of 0 means "no discount".
function checkDiscount(discount) {
  if (discount === null || discount === undefined)
    return { discount: null, error: null }
  const { type, value } = discount

  if (type === 'percent') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      return { discount: null, error: 'Percent must be between 0 and 100' }
    }
    return { discount: value === 0 ? null : { type, value }, error: null }
  }
  if (type === 'amount') {
    if (!Number.isInteger(value) || value < 0) {
      return { discount: null, error: 'Enter a valid discount amount' }
    }
    return { discount: value === 0 ? null : { type, value }, error: null }
  }
  return { discount: null, error: 'Unknown discount type' }
}

export function setLineDiscount(cart, variantId, discount) {
  const line = cart.lines.find((l) => l.variantId === variantId)
  if (!line) return fail(cart, 'Item is not in the bill')

  const checked = checkDiscount(discount)
  if (checked.error) return fail(cart, checked.error)

  if (checked.discount && !isDiscountEligible(line)) {
    return fail(
      cart,
      line.discountAllowed === false
        ? 'This product does not allow discounts'
        : 'Discount is switched off for this item',
    )
  }
  if (checked.discount?.type === 'amount') {
    if (checked.discount.value > lineGrossPaise(line)) {
      return fail(cart, 'Discount cannot be more than the item total')
    }
  }
  return ok(updateLine(cart, variantId, { discount: checked.discount }))
}

// Switches discounts off (or back on) for ONE item on this bill. Switching off also
// removes any discount already given on that item.
export function setLineDiscountExcluded(cart, variantId, excluded) {
  const line = cart.lines.find((l) => l.variantId === variantId)
  if (!line) return fail(cart, 'Item is not in the bill')

  if (!excluded && line.discountAllowed === false) {
    return fail(cart, 'This product does not allow discounts')
  }
  return ok(
    updateLine(
      cart,
      variantId,
      excluded
        ? { discountExcluded: true, discount: null }
        : { discountExcluded: false },
    ),
  )
}

export function setBillDiscount(cart, discount) {
  const checked = checkDiscount(discount)
  if (checked.error) return fail(cart, checked.error)

  if (checked.discount) {
    const before = calculateTotals({ ...cart, billDiscount: null })
    if (before.eligibleBasePaise === 0) {
      return fail(cart, 'No item on this bill can take a discount')
    }
    if (
      checked.discount.type === 'amount' &&
      checked.discount.value > before.eligibleBasePaise
    ) {
      return fail(cart, 'Discount cannot be more than the bill total')
    }
  }
  return ok({ ...cart, billDiscount: checked.discount })
}
