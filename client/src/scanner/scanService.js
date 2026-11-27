import { getVariantByBarcode } from '../db/variantRepo.js'
import { getProduct } from '../db/productRepo.js'

const BARCODE_PATTERN = /^[A-Za-z0-9\-_.]+$/
const MIN_LENGTH = 4
const MAX_LENGTH = 48

// Removes control characters (like \r\n some scanners add) and trims spaces.
export function normalizeBarcode(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
}

// Looks the barcode up as scanned first, then in capitals, then in small letters.
// A scanner can send "clo000425" when Caps Lock is off, but the item is stored as "CLO000425".
async function findVariant(barcode) {
  const tries = [
    ...new Set([barcode, barcode.toUpperCase(), barcode.toLowerCase()]),
  ]
  for (const code of tries) {
    const variant = await getVariantByBarcode(code)
    if (variant) return variant
  }
  return null
}

// Turns raw scanner/keyboard input into a clear result:
//   found | not_found | invalid | archived
// It never throws for bad input; it returns a result the UI can show.
export async function lookupBarcode(raw) {
  const barcode = normalizeBarcode(raw)

  if (!barcode) {
    return { status: 'invalid', barcode, message: 'Enter or scan a barcode' }
  }
  if (
    barcode.length < MIN_LENGTH ||
    barcode.length > MAX_LENGTH ||
    !BARCODE_PATTERN.test(barcode)
  ) {
    return {
      status: 'invalid',
      barcode,
      message: 'That does not look like a valid barcode',
    }
  }

  const variant = await findVariant(barcode)
  if (!variant) {
    return {
      status: 'not_found',
      barcode,
      message: `No product found for barcode ${barcode}`,
    }
  }

  const product = await getProduct(variant.productId)
  if (variant.status !== 'active' || !product || product.status !== 'active') {
    return {
      status: 'archived',
      barcode,
      variant,
      product,
      message: 'This item is archived and cannot be sold',
    }
  }

  return { status: 'found', barcode: variant.barcode, variant, product }
}
