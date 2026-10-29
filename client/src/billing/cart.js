import { calculateTotals } from './calc.js'

// A cart is plain data: { lines: [...], billDiscount: null | {type, value} }.
// Every function returns { cart, error }. If error is set, the cart is unchanged.

const MAX_QUANTITY = 9999

export function createCart() {
  return { lines: [], billDiscount: null }
}

// Copies everything the bill needs, so later product edits do not change it.
export function lineFromVariant(variant, product) {
  return {
    variantId: variant.id,
    productId: product.id,
    productName: product.name,
    sku: variant.sku,
    barcode: variant.barcode,
    size: variant.size,
    unitPricePaise: variant.sellingPricePaise,
    mrpPaise: variant.mrpPaise,
    taxRatePercent: variant.taxRatePercent ?? 0,
    priceIncludesTax: variant.priceIncludesTax ?? true,
    availableStock: variant.currentStock,
    quantity: 1,
    discount: null,
  }
}

const ok = (cart) => ({ cart, error: null })
const fail = (cart, error) => ({ cart, error })

function stockError(line, quantity, allowNegativeStock) {
  if (allowNegativeStock) return null
  if (line.availableStock <= 0) return 'Out of stock'
  if (quantity > line.availableStock)
    return `Only ${line.availableStock} in stock`
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
  const quantity = existing ? existing.quantity + 1 : 1

  const error = stockError(existing ?? newLine, quantity, allowNegativeStock)
  if (error) return fail(cart, error)
  if (quantity > MAX_QUANTITY) return fail(cart, 'Quantity is too large')

  if (existing) return ok(updateLine(cart, newLine.variantId, { quantity }))
  return ok({ ...cart, lines: [...cart.lines, { ...newLine, quantity: 1 }] })
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
  if (quantity > MAX_QUANTITY) return fail(cart, 'Quantity is too large')

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
  if (checked.discount?.type === 'amount') {
    const lineTotal = line.unitPricePaise * line.quantity
    if (checked.discount.value > lineTotal) {
      return fail(cart, 'Discount cannot be more than the item total')
    }
  }
  return ok(updateLine(cart, variantId, { discount: checked.discount }))
}

export function setBillDiscount(cart, discount) {
  const checked = checkDiscount(discount)
  if (checked.error) return fail(cart, checked.error)

  if (checked.discount?.type === 'amount') {
    const withoutBillDiscount = calculateTotals({ ...cart, billDiscount: null })
    const available =
      withoutBillDiscount.subtotalPaise - withoutBillDiscount.itemDiscountPaise
    if (checked.discount.value > available) {
      return fail(cart, 'Discount cannot be more than the bill total')
    }
  }
  return ok({ ...cart, billDiscount: checked.discount })
}
