import { parseLength } from '../lib/quantity.js'
import { productKey } from '../lib/productKey.js'
import { mapHeaders } from './columns.js'

const MAX_PAISE = 100_000_000 // 10 lakh rupees
const MAX_ROWS = 5000
const MAX_METER_CM = 10_000_000 // 100,000 m
const DEFAULT_TAX_PERCENT = 5

const isBlank = (value) =>
  value === null || value === undefined || String(value).trim() === ''
const text = (value) => (isBlank(value) ? '' : String(value).trim())

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
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      errors.push(`${label} must be a number like 599 or 599.50`)
      return undefined
    }
    const [rupees, paiseText = ''] = cleaned.split('.')
    paise = Number(rupees) * 100 + Number(paiseText.padEnd(2, '0'))
  }
  if (paise > MAX_PAISE) {
    errors.push(`${label} is too large`)
    return undefined
  }
  return paise
}

const PIECE_WORDS = ['piece', 'pieces', 'pc', 'pcs', 'nos', 'no']
const METER_WORDS = ['meter', 'meters', 'metre', 'metres', 'm', 'mtr', 'mtrs']
const CM_WORDS = [
  'cm',
  'cms',
  'centimeter',
  'centimeters',
  'centimetre',
  'centimetres',
]

// Returns { unit, quantityIn }.
//   Piece -> pieces.
//   Meter -> fabric, Quantity written in meters (25.5).
//   CM    -> fabric, Quantity written in centimetres (2550).
// For fabric the PRICES are always per meter.
function parseUnit(value, errors) {
  if (isBlank(value)) return { unit: 'piece', quantityIn: 'm' }
  const word = String(value).trim().toLowerCase().replace(/\.$/, '')
  if (PIECE_WORDS.includes(word)) return { unit: 'piece', quantityIn: 'm' }
  if (METER_WORDS.includes(word)) return { unit: 'meter', quantityIn: 'm' }
  if (CM_WORDS.includes(word)) return { unit: 'meter', quantityIn: 'cm' }
  errors.push('Unit must be Piece, Meter or CM')
  return { unit: 'piece', quantityIn: 'm' }
}

// Pieces: a whole number. Fabric: a length, returned as whole centimetres. The cell may
// also carry its own unit ("80 cm", "2.5 m").
function parseQuantity(value, unit, quantityIn, errors) {
  if (isBlank(value)) {
    errors.push('Quantity is empty')
    return 0
  }
  if (unit === 'meter') {
    let cm = null
    if (typeof value === 'number') {
      if (quantityIn === 'cm') {
        cm = Number.isInteger(value) ? value : null
      } else {
        const rounded = Math.round(value * 100)
        cm =
          Number.isFinite(value) && Math.abs(value * 100 - rounded) < 1e-6
            ? rounded
            : null
      }
    } else {
      cm = parseLength(String(value), quantityIn)
    }
    if (cm === null || cm < 1 || cm > MAX_METER_CM) {
      errors.push(
        quantityIn === 'cm'
          ? 'Quantity must be whole centimetres like 80'
          : 'Quantity must be meters like 25 or 25.5',
      )
      return 0
    }
    return cm
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) {
    errors.push('Quantity must be a whole number, 1 or more')
    return 0
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

function emptyPlan(fatal, ignoredColumns = []) {
  return {
    fatal,
    ignoredColumns,
    ready: [],
    problems: [],
    summary: {
      rowsRead: 0,
      ready: 0,
      pieces: 0,
      meters: 0,
      newProducts: 0,
      addedToExisting: 0,
      problems: 0,
    },
  }
}

// Checks every row of the file BEFORE anything is saved. Nothing here touches the
// database: `existing` is a snapshot ({ products, variants }) passed in.
// Every row is its own stock entry. The same product and size may appear any number
// of times: nothing is skipped or refused for being a repeat.
// A fabric (Meter or CM) and a garment (Piece) with the same name are separate products.
export function planImport(rows, existing = { products: [], variants: [] }) {
  const headerIndex = rows.findIndex((r) => r.some((cell) => !isBlank(cell)))
  if (headerIndex === -1) return emptyPlan('The file is empty.')

  const { columns, missing, unknown } = mapHeaders(rows[headerIndex])
  if (missing.length > 0) {
    return emptyPlan(
      `Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. The first row of the sheet must contain the column headings.`,
      unknown,
    )
  }
  if (rows.length - headerIndex - 1 > MAX_ROWS) {
    return emptyPlan(
      `The file has more than ${MAX_ROWS.toLocaleString('en-US')} rows. Please split it into smaller files.`,
      unknown,
    )
  }

  // An existing product is reused when name, company, category AND unit all match.
  const unitByProduct = new Map()
  for (const v of existing.variants ?? []) {
    if (!unitByProduct.has(v.productId))
      unitByProduct.set(v.productId, v.unit ?? 'piece')
  }
  const productByKey = new Map()
  for (const p of existing.products) {
    if (p.status === 'archived') continue
    const key = `${productKey(p.name, p.category, p.brand)}|${unitByProduct.get(p.id) ?? 'piece'}`
    if (!productByKey.has(key)) productByKey.set(key, p)
  }

  const ready = []
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
    const size = str('size', 'Size', 50, false)
    const brand = str('brand', 'Company', 60, false)
    const category = str('category', 'Category', 60, false)
    const { unit, quantityIn } = parseUnit(get('unit'), errors)
    const quantity = parseQuantity(get('quantity'), unit, quantityIn, errors)

    const selling = parseMoney(get('sellingPrice'), 'Selling Price', errors)
    if (selling === null) errors.push('Selling Price is empty')
    const cost = parseMoney(get('costPrice'), 'Cost', errors)
    let mrp = parseMoney(get('mrp'), 'MRP', errors)
    if (mrp === null && typeof selling === 'number') mrp = selling

    const tax = parseTax(get('tax'), errors)
    const priceIncludesTax = parseYesNo(
      get('priceIncludesTax'),
      'Price Includes Tax',
      errors,
      true,
    )
    const discountAllowed = parseYesNo(
      get('allowDiscount'),
      'Allow Discount',
      errors,
      true,
    )

    if (errors.length > 0) {
      problems.push({
        row: rowNumber,
        name: name || '(no name)',
        message: errors.join('. '),
      })
      continue
    }

    const key = `${productKey(name, category, brand)}|${unit}`
    const existingProduct = productByKey.get(key) ?? null

    ready.push({
      row: rowNumber,
      key,
      existingProductId: existingProduct?.id ?? null,
      discountAllowed,
      product: { name, category, brand },
      variant: {
        size,
        unit,
        quantity,
        costPaise: cost ?? 0,
        mrpPaise: mrp,
        sellingPricePaise: selling,
        taxRatePercent: tax,
        priceIncludesTax,
      },
    })
  }

  const newKeys = new Set(
    ready.filter((r) => !r.existingProductId).map((r) => r.key),
  )
  const existingIds = new Set(
    ready.filter((r) => r.existingProductId).map((r) => r.existingProductId),
  )
  const total = (unit) =>
    ready
      .filter((r) => r.variant.unit === unit)
      .reduce((sum, r) => sum + r.variant.quantity, 0)

  return {
    fatal: null,
    ignoredColumns: unknown,
    ready,
    problems,
    summary: {
      rowsRead,
      ready: ready.length,
      pieces: total('piece'),
      meters: total('meter'), // in centimetres
      newProducts: newKeys.size,
      addedToExisting: existingIds.size,
      problems: problems.length,
    },
  }
}
