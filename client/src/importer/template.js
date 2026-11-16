export const TEMPLATE_HEADERS = [
  'Product Name',
  'Size',
  'Quantity',
  'Cost',
  'Selling Price',
  'Company',
  'Category',
  'MRP',
  'Tax %',
  'Price Includes Tax',
  'Allow Discount',
]

// Rows 1 and 2 are the same product and size on purpose: each row is its own entry.
const EXAMPLES = [
  [
    "Men's Casual Shirt",
    'M',
    10,
    320,
    599,
    'UrbanFit',
    'Shirts',
    799,
    5,
    'Yes',
    'Yes',
  ],
  [
    "Men's Casual Shirt",
    'M',
    6,
    330,
    629,
    'UrbanFit',
    'Shirts',
    799,
    5,
    'Yes',
    'Yes',
  ],
  [
    "Men's Casual Shirt",
    'L',
    12,
    320,
    599,
    'UrbanFit',
    'Shirts',
    799,
    5,
    'Yes',
    'Yes',
  ],
  [
    'Denim Jeans',
    '32',
    5,
    550,
    1299,
    'BlueRiver',
    'Jeans',
    1599,
    5,
    'Yes',
    'No',
  ],
  ['कॉटन शर्ट', '', 8, 150, 250, '', '', '', 5, 'Yes', 'Yes'],
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
