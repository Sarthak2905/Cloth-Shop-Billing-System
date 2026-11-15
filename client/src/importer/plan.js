import { paiseToRupees, rupeesToPaise } from '../lib/money.js'
import { mapHeaders } from './columns.js'

const MAX_PAISE = 100_000_000 // 10 lakh rupees
const DEFAULT_TAX_PERCENT = 5
const DEFAULT_LOW_STOCK = 3
export const BARCODE_PATTERN = /^[A-Za-z0-9\-_.]{4,48}$/

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === ''
const text = (value) => (isBlank(value) ? '' : String(value).trim())
const squash = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
export const productKey = (name, category, brand) =>
  [squash(name), squash(category), squash(brand)].join('|')

export function makeSkuBase(name, size) {
  const letters =
    String(name)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'ITEM'
  const sizePart = String(size)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return sizePart ? `${letters}-${sizePart}` : letters
}

// Money: returns paise, null when blank, or undefined after pushing an error.
function parseMoney(value, label, errors) {
  if (isBlank(value)) return null
  let paise
  if (typeof value === 'number') {
    const scaled = value * 100
    paise = Math.round(scaled)
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      Math.abs(scaled - paise) > 1e-6
    ) {
      errors.push(`${label} must be a number like 599 or 599.50`)
      return undefined
    }
  } else {
    const cleaned = String(value)
      .replace(/₹|,|\s/g, '')
      .replace(/^rs\.?/i, '')
    try {
      paise = rupeesToPaise(cleaned)
    } catch {
      errors.push(`${label} must be a number like 599 or 599.50`)
      return undefined
    }
  }
  if (paise > MAX_PAISE) {
    errors.push(`${label} is too large`)
    return undefined
  }
  return paise
}

function parseWhole(value, label, errors, fallback) {
  if (isBlank(value)) return fallback
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
    errors.push(`${label} must be a whole number (0 or more)`)
    return fallback
  }
  return n
}

function parseTax(value, errors) {
  if (isBlank(value)) return DEFAULT_TAX_PERCENT
  let n =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/%|\s/g, ''))
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    errors.push('Tax % must be a number from 0 to 100')
    return DEFAULT_TAX_PERCENT
  }
  // A cell formatted as a percentage is stored by Excel as a fraction (5% is 0.05).
  if (n > 0 && n < 1) n = Number((n * 100).toFixed(2))
  return n
}

const YES = ['yes', 'y', 'true', '1', 'हो', 'होय']
const NO = ['no', 'n', 'false', '0', 'नाही', 'नको']

function parseYesNo(value, label, errors, fallback) {
  if (isBlank(value)) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }
  const t = String(value).trim().toLowerCase()
  if (YES.includes(t)) return true
  if (NO.includes(t)) return false
  errors.push(`${label} must be Yes or No`)
  return fallback
}

function emptyPlan(fatal, rowsRead = 0) {
  return {
    fatal,
    ready: [],
    skippedExisting: [],
    problems: [],
    summary: {
      rowsRead,
      ready: 0,
      newProducts: 0,
      addedToExisting: 0,
      skippedExisting: 0,
      problems: 0,
    },
  }
}

// Checks every row of the file BEFORE anything is saved. Nothing here touches the
// database: `existing` is a snapshot ({ products, variants }) passed in.
export function planImport(rows, existing = { products: [], variants: [] }) {
  const headerIndex = rows.findIndex((r) => r.some((cell) => !isBlank(cell)))
  if (headerIndex === -1) return emptyPlan('The file is empty.')

  const { columns, missing } = mapHeaders(rows[headerIndex])
  if (missing.length > 0) {
    return emptyPlan(
      `Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. The first row of the sheet must contain the column headings.`,
    )
  }

  const productByKey = new Map(
    existing.products.map((p) => [productKey(p.name, p.category, p.brand), p]),
  )
  const sizesByProduct = new Map()
  const barcodeOwner = new Map()
  const skuTaken = new Set()
  for (const v of existing.variants) {
    if (!sizesByProduct.has(v.productId))
      sizesByProduct.set(v.productId, new Set())
    sizesByProduct.get(v.productId).add(squash(v.size))
    if (v.barcode) barcodeOwner.set(v.barcode, v.sku)
    skuTaken.add(v.sku)
  }

  const seenSizes = new Map()
  const fileBarcodes = new Map()
  const fileSkus = new Map()
  const ready = []
  const skippedExisting = []
  const problems = []
  let rowsRead = 0

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const cells = rows[i]
    if (cells.every(isBlank)) continue
    rowsRead += 1
    const rowNumber = i + 1 // the row number you see in Excel
    const errors = []
    const get = (field) =>
      columns[field] === undefined ? undefined : cells[columns[field]]

    const str = (field, label, max, required) => {
      const raw = get(field)
      if (raw instanceof Date) {
        errors.push(
          `${label} looks like a date. Format that column as Text in Excel`,
        )
        return ''
      }
      const value = text(raw)
      if (required && !value) errors.push(`${label} is empty`)
      if (value.length > max)
        errors.push(`${label} is longer than ${max} characters`)
      return value
    }

    const name = str('productName', 'Product Name', 120, true)
    const category = str('category', 'Category', 60, true)
    const brand = str('brand', 'Brand', 60, false)
    const supplier = str('supplier', 'Supplier', 120, false)
    const size = str('size', 'Size', 20, true)
    let sku = str('sku', 'SKU', 40, false)
    const barcode = str('barcode', 'Barcode', 48, false)
    if (barcode && !BARCODE_PATTERN.test(barcode)) {
      errors.push(
        'Barcode may only contain letters, numbers, - _ . and must be 4 to 48 characters',
      )
    }

    const selling = parseMoney(get('sellingPrice'), 'Selling Price', errors)
    if (selling === null) errors.push('Selling Price is empty')
    let mrp = parseMoney(get('mrp'), 'MRP', errors)
    const cost = parseMoney(get('costPrice'), 'Cost Price', errors)
    if (mrp === null && typeof selling === 'number') mrp = selling
    if (
      typeof selling === 'number' &&
      typeof mrp === 'number' &&
      selling > mrp
    ) {
      errors.push(
        `Selling Price (${paiseToRupees(selling)}) is more than MRP (${paiseToRupees(mrp)})`,
      )
    }

    const tax = parseTax(get('tax'), errors)
    const priceIncludesTax = parseYesNo(
      get('priceIncludesTax'),
      'Price Includes Tax',
      errors,
      true,
    )
    const openingStock = parseWhole(
      get('openingStock'),
      'Opening Stock',
      errors,
      0,
    )
    const reorderThreshold = parseWhole(
      get('lowStockAlert'),
      'Low Stock Alert',
      errors,
      DEFAULT_LOW_STOCK,
    )
    const discountAllowed = parseYesNo(
      get('allowDiscount'),
      'Allow Discount',
      errors,
      true,
    )

    const fail = () =>
      problems.push({
        row: rowNumber,
        name: name || '(no name)',
        message: errors.join('. '),
      })
    if (errors.length > 0) {
      fail()
      continue
    }

    const key = productKey(name, category, brand)
    const existingProduct = productByKey.get(key) ?? null
    const sizeKey = squash(size)

    if (existingProduct?.status === 'archived') {
      errors.push(
        'This product exists but is archived. Restore it or change its name first',
      )
      fail()
      continue
    }
    if (
      existingProduct &&
      sizesByProduct.get(existingProduct.id)?.has(sizeKey)
    ) {
      skippedExisting.push({ row: rowNumber, name, size })
      continue
    }

    const sizeId = `${key}|${sizeKey}`
    if (seenSizes.has(sizeId))
      errors.push(`Same product and size as row ${seenSizes.get(sizeId)}`)
    if (barcode) {
      if (barcodeOwner.has(barcode)) {
        errors.push(
          `Barcode ${barcode} is already used by ${barcodeOwner.get(barcode)}`,
        )
      } else if (fileBarcodes.has(barcode)) {
        errors.push(`Same barcode as row ${fileBarcodes.get(barcode)}`)
      }
    }
    if (sku) {
      if (skuTaken.has(sku)) errors.push(`SKU "${sku}" is already used`)
      else if (fileSkus.has(sku))
        errors.push(`Same SKU as row ${fileSkus.get(sku)}`)
    }
    if (errors.length > 0) {
      fail()
      continue
    }

    if (!sku) {
      const base = makeSkuBase(name, size)
      let candidate = base
      let n = 1
      while (skuTaken.has(candidate) || fileSkus.has(candidate)) {
        n += 1
        candidate = `${base}-${n}`
      }
      sku = candidate
    }

    seenSizes.set(sizeId, rowNumber)
    fileSkus.set(sku, rowNumber)
    if (barcode) fileBarcodes.set(barcode, rowNumber)

    ready.push({
      row: rowNumber,
      key,
      existingProductId: existingProduct?.id ?? null,
      discountAllowed,
      product: { name, category, brand, supplier },
      variant: {
        sku,
        barcode: barcode || null,
        size,
        costPaise: cost ?? 0,
        mrpPaise: mrp,
        sellingPricePaise: selling,
        taxRatePercent: tax,
        priceIncludesTax,
        reorderThreshold,
        openingStock,
      },
    })
  }

  const newKeys = new Set(
    ready.filter((r) => !r.existingProductId).map((r) => r.key),
  )
  const existingIds = new Set(
    ready.filter((r) => r.existingProductId).map((r) => r.existingProductId),
  )

  return {
    fatal: null,
    ready,
    skippedExisting,
    problems,
    summary: {
      rowsRead,
      ready: ready.length,
      newProducts: newKeys.size,
      addedToExisting: existingIds.size,
      skippedExisting: skippedExisting.length,
      problems: problems.length,
    },
  }
}
