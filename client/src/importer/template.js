export const TEMPLATE_HEADERS = [
  'Product Name',
  'Category',
  'Brand',
  'Supplier',
  'Size',
  'SKU',
  'Barcode',
  'Cost Price',
  'MRP',
  'Selling Price',
  'Tax %',
  'Price Includes Tax',
  'Opening Stock',
  'Low Stock Alert',
  'Allow Discount',
]

const EXAMPLES = [
  [
    "Men's Casual Shirt",
    'Shirts',
    'UrbanFit',
    'Pune Garments',
    'M',
    '',
    '',
    320,
    799,
    599,
    5,
    'Yes',
    10,
    3,
    'Yes',
  ],
  [
    "Men's Casual Shirt",
    'Shirts',
    'UrbanFit',
    'Pune Garments',
    'L',
    '',
    '',
    320,
    799,
    599,
    5,
    'Yes',
    12,
    3,
    'Yes',
  ],
  [
    'Denim Jeans',
    'Jeans',
    'BlueRiver',
    '',
    '32',
    '',
    '',
    550,
    1599,
    1299,
    5,
    'Yes',
    5,
    3,
    'No',
  ],
  [
    'कॉटन शर्ट',
    'Shirts',
    '',
    '',
    'M',
    '',
    '',
    150,
    '',
    250,
    5,
    'Yes',
    8,
    3,
    'Yes',
  ],
]

function csvEscape(value) {
  const s = String(value ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// A UTF-8 marker at the start makes Excel show Marathi text correctly.
export function buildTemplateCsv() {
  const lines = [TEMPLATE_HEADERS, ...EXAMPLES].map((row) =>
    row.map(csvEscape).join(','),
  )
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function downloadFile(
  filename,
  content,
  mime = 'text/csv;charset=utf-8',
) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
