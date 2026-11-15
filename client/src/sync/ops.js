// Turns rows from the device's database into the operations the server understands.
// Each operation also carries a few fields for the engine's own use (kind, key, ...);
// toRequestOp() removes them before anything is sent.

// A short fingerprint of some text. It is used only to notice that an item's
// catalogue fields changed. It is not security.
export function fingerprint(text) {
  let a = 0x811c9dc5
  let b = 0x84222325
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = Math.imul(b ^ code, 0x1b873593) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

export const toRequestOp = ({ type, data }) => ({ type, data })

export function productOp(product) {
  return {
    type: 'product.upsert',
    data: {
      id: product.id,
      name: product.name,
      category: product.category,
      brand: product.brand ?? '',
      supplier: product.supplier ?? '',
      status: product.status,
      discountAllowed: product.discountAllowed !== false,
    },
    kind: 'product',
    entityId: product.id,
    entityTime: product.updatedAt,
    key: `${product.updatedAt}|${product.id}`,
    label: product.name,
  }
}

// Stock is deliberately NOT part of an item. It travels as movements and sales.
const VARIANT_FIELDS = [
  'productId',
  'sku',
  'barcode',
  'size',
  'costPaise',
  'mrpPaise',
  'sellingPricePaise',
  'taxRatePercent',
  'priceIncludesTax',
  'reorderThreshold',
  'status',
]

export function variantOp(variant) {
  const v = {
    ...variant,
    taxRatePercent: variant.taxRatePercent ?? 0,
    priceIncludesTax: variant.priceIncludesTax ?? true,
    reorderThreshold: variant.reorderThreshold ?? 0,
  }
  const data = { id: v.id }
  for (const field of VARIANT_FIELDS) data[field] = v[field]

  return {
    type: 'variant.upsert',
    data,
    kind: 'variant',
    entityId: v.id,
    entityTime: v.createdAt,
    key: `${v.createdAt}|${v.id}`,
    label: v.sku,
    fingerprint: fingerprint(
      JSON.stringify(VARIANT_FIELDS.map((field) => v[field])),
    ),
  }
}

export function movementOp(movement) {
  const change = movement.quantityChange
  return {
    type: 'stock.movement',
    data: {
      id: movement.id,
      variantId: movement.variantId,
      type: movement.type,
      quantityChange: change,
      reason: String(movement.reason ?? '').slice(0, 200),
      createdAt: movement.createdAt,
    },
    kind: 'movement',
    entityId: movement.id,
    entityTime: movement.createdAt,
    key: `${movement.createdAt}|${movement.id}`,
    label: `Stock ${movement.type} ${change > 0 ? '+' : ''}${change}`,
  }
}

const discountOf = (discount) => ({
  type: discount.type,
  value: discount.value,
})

// The server recalculates every total itself. Only what the customer saw (the unit
// prices and discounts), which items had discounts switched off, and the total the
// device calculated (to compare) are sent.
export function saleOp(sale, items) {
  const lines = [...items]
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      ...(item.discount ? { discount: discountOf(item.discount) } : {}),
      ...(item.discountExcluded ? { noDiscount: true } : {}),
    }))

  const payment = { method: sale.payment.method }
  if (sale.payment.method === 'cash')
    payment.amountTenderedPaise = sale.payment.amountTenderedPaise
  if (sale.payment.reference) payment.reference = sale.payment.reference

  return {
    type: 'sale.create',
    data: {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      soldAt: sale.createdAt,
      offline: true,
      lines,
      ...(sale.billDiscount
        ? { billDiscount: discountOf(sale.billDiscount) }
        : {}),
      payment,
      claimedTotalPaise: sale.totalPaise,
    },
    kind: 'sale',
    entityId: sale.id,
    entityTime: sale.createdAt,
    key: `${sale.createdAt}|${sale.id}`,
    label: sale.invoiceNumber,
  }
}
