import { mapHeaders } from './columns'

test('recognises headings whatever the capitals, spaces and punctuation', () => {
  const { columns, missing } = mapHeaders([
    'product name',
    ' Size ',
    'QTY',
    'Cost',
    'Selling  Price',
    'Company',
    'CATEGORY',
    'mrp',
    'Tax %',
    'Price Includes Tax',
    'Allow Discount',
  ])

  expect(missing).toEqual([])
  expect(columns).toMatchObject({
    productName: 0,
    size: 1,
    quantity: 2,
    costPrice: 3,
    sellingPrice: 4,
    brand: 5,
    category: 6,
    mrp: 7,
    tax: 8,
    priceIncludesTax: 9,
    allowDiscount: 10,
  })
})

test('lists the required columns that are missing', () => {
  expect(mapHeaders(['Size', 'Cost']).missing).toEqual([
    'Product Name',
    'Quantity',
    'Selling Price',
  ])
})

test('old headings still work, and SKU, Barcode and other unknown headings are reported and ignored', () => {
  const { columns, missing, unknown } = mapHeaders([
    'Product Name',
    'Opening Stock',
    'Selling Price',
    'Brand',
    'SKU',
    'Barcode',
    'Colour',
  ])

  expect(missing).toEqual([])
  expect(columns.quantity).toBe(1)
  expect(columns.brand).toBe(3)
  expect(unknown).toEqual(['SKU', 'Barcode', 'Colour'])
})

test('when a heading appears twice, the first one is used', () => {
  const { columns } = mapHeaders([
    'Quantity',
    'Selling Price',
    'Product Name',
    'Qty',
  ])

  expect(columns.quantity).toBe(0)
})
