import { mapHeaders } from './columns'

test('recognises headings whatever the capitals, spaces and punctuation', () => {
  const { columns, missing } = mapHeaders([
    'product name',
    'CATEGORY',
    ' Size ',
    'Selling  Price',
    'Tax %',
    'Qty',
    'Price Includes Tax',
    'Allow Discount',
    'Low Stock Alert',
    'Cost price',
    'mrp',
    'SKU',
    'Barcode',
    'Brand',
    'Supplier',
  ])

  expect(missing).toEqual([])
  expect(columns).toMatchObject({
    productName: 0,
    category: 1,
    size: 2,
    sellingPrice: 3,
    tax: 4,
    openingStock: 5,
    priceIncludesTax: 6,
    allowDiscount: 7,
    lowStockAlert: 8,
    costPrice: 9,
    mrp: 10,
    sku: 11,
    barcode: 12,
    brand: 13,
    supplier: 14,
  })
})

test('lists the required columns that are missing', () => {
  expect(mapHeaders(['Brand']).missing).toEqual([
    'Product Name',
    'Category',
    'Size',
    'Selling Price',
  ])
})

test('headings it does not know are reported and ignored', () => {
  const { unknown, missing } = mapHeaders([
    'Product Name',
    'Category',
    'Size',
    'Selling Price',
    'Colour',
  ])
  expect(missing).toEqual([])
  expect(unknown).toEqual(['Colour'])
})

test('when a heading appears twice, the first one is used', () => {
  const { columns } = mapHeaders([
    'Size',
    'Selling Price',
    'Product Name',
    'Category',
    'Size',
  ])
  expect(columns.size).toBe(0)
})
