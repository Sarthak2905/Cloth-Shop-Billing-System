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
      category: product.category ?? '',
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
// For fabric (unit 'meter') stock and quantities are whole centimetres.
const VARIANT_FIELDS = [
  'productId',
  'sku',
  'barcode',
  'size',
  'unit',
  'packSize',
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
    sku: variant.sku ?? '',
    size: variant.size ?? '',
    unit: variant.unit ?? 'piece',
    taxRatePercent: variant.taxRatePercent ?? 0,
    priceIncludesTax: variant.priceIncludesTax ?? true,
    reorderThreshold: variant.reorderThreshold ?? 0,
  }
  const data = { id: v.id }
  for (const field of VARIANT_FIELDS) {
    if (v[field] !== undefined && v[field] !== null) data[field] = v[field]
  }

  return {
    type: 'variant.upsert',
    data,
    kind: 'variant',
    entityId: v.id,
    entityTime: v.createdAt,
    key: `${v.createdAt}|${v.id}`,
    label: v.sku || v.barcode,
    fingerprint: fingerprint(
      JSON.stringify(VARIANT_FIELDS.map((field) => v[field] ?? null)),
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

const paymentLineOf = (p) => ({
  method: p.method,
  amountPaise: p.amountPaise,
  ...(p.reference ? { reference: p.reference } : {}),
})

// A bill's payment. New bills have a list of payment lines (empty = payment pending, a
// bill paid in parts has several). Older bills have one payment.
function paymentFields(sale) {
  if (Array.isArray(sale.payments)) {
    return { payments: sale.payments.map(paymentLineOf) }
  }
  const payment = { method: sale.payment.method }
  if (sale.payment.method === 'cash')
    payment.amountTenderedPaise = sale.payment.amountTenderedPaise
  if (sale.payment.reference) payment.reference = sale.payment.reference
  return { payment }
}

// The server recalculates every total itself. Only what the customer saw (the unit
// prices and discounts), which items had discounts switched off, what each item cost,
// and the total the device calculated (to compare) are sent.
export function saleOp(sale, items) {
  const lines = [...items]
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      ...(item.discount ? { discount: discountOf(item.discount) } : {}),
      ...(item.discountExcluded || item.discountAllowed === false
        ? { noDiscount: true }
        : {}),
      ...(Number.isInteger(item.costPaise)
        ? { costPaise: item.costPaise }
        : {}),
    }))

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
      ...paymentFields(sale),
      claimedTotalPaise: sale.totalPaise,
      ...(sale.replacesSaleId
        ? {
            replacesSaleId: sale.replacesSaleId,
            ...(sale.replacesInvoice
              ? { replacesInvoice: sale.replacesInvoice }
              : {}),
          }
        : {}),
    },
    kind: 'sale',
    entityId: sale.id,
    entityTime: sale.createdAt,
    key: `${sale.createdAt}|${sale.id}`,
    label: sale.invoiceNumber,
    // which version of the payment this operation carries
    paymentRev: sale.paymentRev ?? 0,
  }
}

// The payment of a bill that is already on the server, recorded or changed later.
// `rev` goes up with every change, so an older version arriving late is ignored.
export function salePaymentOp(sale) {
  const rev = sale.paymentRev ?? 0
  return {
    type: 'sale.payment',
    data: {
      saleId: sale.id,
      payments: (sale.payments ?? []).map(paymentLineOf),
      ...(sale.paymentRecordedAt ? { recordedAt: sale.paymentRecordedAt } : {}),
      rev,
    },
    kind: 'salepay',
    entityId: sale.id,
    entityTime: sale.createdAt,
    key: `${sale.createdAt}|${sale.id}`,
    label: `Payment of ${sale.invoiceNumber}`,
    paymentRev: rev,
  }
}

// A bill that was cancelled on this device (usually replaced by a corrected bill).
export function saleCancelOp(sale) {
  return {
    type: 'sale.cancel',
    data: {
      saleId: sale.id,
      cancelledAt: sale.cancelledAt,
      reason: sale.cancelReason,
      ...(sale.replacedBySaleId
        ? { replacedBySaleId: sale.replacedBySaleId }
        : {}),
      ...(sale.replacedByInvoice
        ? { replacedByInvoice: sale.replacedByInvoice }
        : {}),
    },
    kind: 'salecancel',
    entityId: sale.id,
    entityTime: sale.createdAt,
    key: `${sale.createdAt}|${sale.id}`,
    label: `Cancellation of ${sale.invoiceNumber}`,
  }
}
