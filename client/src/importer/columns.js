// The columns of the import file. Headings are matched ignoring capitals, spaces
// and punctuation, so "Selling Price", "selling_price" and "SELLING PRICE" all work.
// SKU and Barcode are not columns any more: they are listed as "ignored".
const ALIASES = {
  productName: ['productname', 'product', 'name', 'itemname', 'item'],
  size: ['size'],
  quantity: ['quantity', 'qty', 'openingstock', 'stock', 'currentstock'],
  costPrice: ['cost', 'costprice', 'purchaseprice'],
  sellingPrice: ['sellingprice', 'saleprice', 'price', 'sp'],
  brand: ['company', 'brand', 'companyname'],
  category: ['category', 'type', 'group'],
  mrp: ['mrp', 'maximumretailprice'],
  tax: ['tax%', 'tax', 'taxpercent', 'gst%', 'gst', 'gstpercent'],
  priceIncludesTax: [
    'priceincludestax',
    'includestax',
    'taxincluded',
    'inclusiveoftax',
  ],
  allowDiscount: ['allowdiscount', 'discountallowed', 'discount'],
  unit: ['unit', 'soldby', 'unitofmeasure', 'uom'],
}

export const REQUIRED = [
  { field: 'productName', label: 'Product Name' },
  { field: 'quantity', label: 'Quantity' },
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
// `unknown` = headings that are not used (they are simply ignored).
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
