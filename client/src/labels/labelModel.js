import { chooseSymbology } from './ean.js'
import { formatINR } from '../lib/money.js'

export const LABEL_PRESETS = [
  { id: '50x25', label: '50 × 25 mm', widthMm: 50, heightMm: 25 },
  { id: '40x30', label: '40 × 30 mm', widthMm: 40, heightMm: 30 },
  { id: '38x25', label: '38 × 25 mm', widthMm: 38, heightMm: 25 },
]

const LIMITS = { minWidth: 20, maxWidth: 100, minHeight: 15, maxHeight: 100 }

// Returns an error message, or null when the size is fine.
export function validateLabelSize(widthMm, heightMm) {
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) {
    return 'Enter the label width and height in millimetres'
  }
  if (widthMm < LIMITS.minWidth || widthMm > LIMITS.maxWidth) {
    return `Width must be between ${LIMITS.minWidth} and ${LIMITS.maxWidth} mm`
  }
  if (heightMm < LIMITS.minHeight || heightMm > LIMITS.maxHeight) {
    return `Height must be between ${LIMITS.minHeight} and ${LIMITS.maxHeight} mm`
  }
  return null
}

// A size of "-" (or empty) means "no size", so nothing is printed for it.
const NO_SIZE = new Set(['', '-', '--', 'na', 'n/a'])

// The line under the item name: "Size M" for a garment, the design or shade for fabric
// sold by the meter, and nothing at all when there is no size.
export function labelDetail(variant) {
  const size = String(variant.size ?? '').trim()
  if (NO_SIZE.has(size.toLowerCase())) return ''
  return variant.unit === 'meter' ? size : `Size ${size}`
}

// priceMode: 'mrp' | 'selling' | 'none'. Fabric prices are per meter, so they say "/ m".
// header: a name printed at the top of the label (for example the shop name). Empty = none.
export function buildLabel(
  variant,
  product,
  { priceMode = 'mrp', header = '' } = {},
) {
  const { symbology, warning } = chooseSymbology(variant.barcode)
  const per = variant.unit === 'meter' ? ' / m' : ''
  const top = String(header ?? '').trim()

  let priceText = null
  if (priceMode === 'mrp')
    priceText = `MRP ${formatINR(variant.mrpPaise)}${per}`
  if (priceMode === 'selling')
    priceText = `${formatINR(variant.sellingPricePaise)}${per}`

  return {
    variantId: variant.id,
    title: product.name,
    size: variant.size,
    detail: labelDetail(variant),
    unit: variant.unit ?? 'piece',
    sku: variant.sku,
    barcode: variant.barcode,
    symbology,
    warning,
    priceText,
    ...(top ? { header: top } : {}),
  }
}
