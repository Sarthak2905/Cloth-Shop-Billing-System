// The columns of the import file. Headings are matched ignoring capitals, spaces
// and punctuation, so "Selling Price", "selling_price" and "SELLING PRICE" all work.
const ALIASES = {
  productName: ['productname', 'product', 'name', 'itemname', 'item'],
  category: ['category', 'type', 'group'],
  brand: ['brand'],
  supplier: ['supplier', 'vendor'],
  size: ['size'],
  sku: ['sku', 'itemcode', 'code'],
  barcode: ['barcode', 'barcodenumber'],
  costPrice: ['costprice', 'cost', 'purchaseprice'],
  mrp: ['mrp', 'maximumretailprice'],
  sellingPrice: ['sellingprice', 'saleprice', 'price', 'sp'],
  tax: ['tax%', 'tax', 'taxpercent', 'gst%', 'gst', 'gstpercent'],
  priceIncludesTax: [
    'priceincludestax',
    'includestax',
    'taxincluded',
    'inclusiveoftax',
  ],
  openingStock: ['openingstock', 'stock', 'quantity', 'qty', 'currentstock'],
  lowStockAlert: [
    'lowstockalert',
    'lowstock',
    'reorderlevel',
    'minimumstock',
    'minstock',
  ],
  allowDiscount: ['allowdiscount', 'discountallowed', 'discount'],
}

export const REQUIRED = [
  { field: 'productName', label: 'Product Name' },
  { field: 'category', label: 'Category' },
  { field: 'size', label: 'Size' },
  { field: 'sellingPrice', label: 'Selling Price' },
]

const FIELD_BY_ALIAS = new Map()
for (const [field, names] of Object.entries(ALIASES)) {
  for (const name of names) FIELD_BY_ALIAS.set(name, field)
}

const normalize = (cell) =>
  String(cell ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, '')

// Returns where each column is: { columns: { productName: 0, ... }, missing: [...], unknown: [...] }
export function mapHeaders(headerRow) {
  const columns = {}
  const unknown = []

  headerRow.forEach((cell, index) => {
    const heading = normalize(cell)
    if (!heading) return
    const field = FIELD_BY_ALIAS.get(heading)
    if (!field) {
      unknown.push(String(cell).trim())
      return
    }
    if (columns[field] === undefined) columns[field] = index // the first one wins
  })

  const missing = REQUIRED.filter(
    ({ field }) => columns[field] === undefined,
  ).map(({ label }) => label)
  return { columns, missing, unknown }
}
