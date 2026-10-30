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

// priceMode: 'mrp' | 'selling' | 'none'
export function buildLabel(variant, product, { priceMode = 'mrp' } = {}) {
  const { symbology, warning } = chooseSymbology(variant.barcode)

  let priceText = null
  if (priceMode === 'mrp') priceText = `MRP ${formatINR(variant.mrpPaise)}`
  if (priceMode === 'selling') priceText = formatINR(variant.sellingPricePaise)

  return {
    variantId: variant.id,
    title: product.name,
    size: variant.size,
    sku: variant.sku,
    barcode: variant.barcode,
    symbology,
    warning,
    priceText,
  }
}
