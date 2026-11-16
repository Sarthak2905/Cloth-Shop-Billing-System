// A size of "-" (or empty) means "no size", so it is not printed.
const NO_SIZE = new Set(['', '-', '--', 'na', 'n/a'])

export function sizeText(size) {
  const value = String(size ?? '').trim()
  return NO_SIZE.has(value.toLowerCase()) ? '' : ` (${value})`
}

// An item takes part in the bill discount unless its product never takes a discount,
// or the cashier switched discounts off for it on this bill. (Older bills without
// these fields count as taking part.)
export const isDiscountItem = (item) =>
  item.discountAllowed !== false && item.discountExcluded !== true

// A meter line (a length of fabric) counts as one item.
const countOf = (list) =>
  list.reduce((n, i) => n + (i.unit === 'meter' ? 1 : i.quantity), 0)

// How the items of a bill are laid out on the receipt.
// With a bill discount: the items that took part in it come first, with their subtotal,
// the discount and the amount after the discount; then the items without a discount.
// Without a bill discount (or when no item took part): one plain list.
export function groupReceiptItems(sale, items) {
  const billDiscountPaise = sale.billDiscountPaise ?? 0
  const withDiscount = items.filter(isDiscountItem)
  if (billDiscountPaise <= 0 || withDiscount.length === 0)
    return { grouped: false }

  const subtotalPaise = withDiscount.reduce(
    (sum, item) => sum + item.grossPaise - (item.lineDiscountPaise ?? 0),
    0,
  )
  return {
    grouped: true,
    withDiscount,
    withoutDiscount: items.filter((item) => !isDiscountItem(item)),
    withDiscountCount: countOf(withDiscount),
    subtotalPaise,
    billDiscountPaise,
    afterDiscountPaise: subtotalPaise - billDiscountPaise,
  }
}
