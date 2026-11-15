import { documentToHtml, documentToPage, escapeHtml } from './receiptHtml'

const doc = (over = {}) => ({
  paperWidth: '80-42',
  language: 'en',
  textSize: 'normal',
  blocks: [
    { kind: 'center', text: 'Tom & <Jerry> Shop', bold: true },
    { kind: 'divider', style: 'dash' },
    { kind: 'row', left: 'Invoice:', right: 'INV-000022' },
    { kind: 'divider', style: 'double' },
    { kind: 'row', left: 'TOTAL', right: '764.00', bold: true, big: true },
  ],
  ...over,
})

test('all text is made safe and a row keeps its left and right parts apart', () => {
  const html = documentToHtml(doc())

  expect(html).toContain('Tom &amp; &lt;Jerry&gt; Shop')
  expect(html).not.toContain('<Jerry>')
  expect(html).toContain('display:flex')
  expect(html).toContain('justify-content:space-between')
  expect(html).toContain('white-space:nowrap')
  expect(escapeHtml('"a"')).toBe('&quot;a&quot;')
})

test('a bigger text size gives bigger letters, and narrow paper scales them down', () => {
  expect(documentToHtml(doc({ textSize: 'normal' }))).toContain('font-size:3mm')
  expect(documentToHtml(doc({ textSize: 'large' }))).toContain(
    'font-size:3.6mm',
  )
  expect(documentToHtml(doc({ textSize: 'extra' }))).toContain(
    'font-size:4.2mm',
  )
  // 3.6 mm x (46 / 70) = 2.37 mm
  expect(
    documentToHtml(doc({ paperWidth: '58', textSize: 'large' })),
  ).toContain('font-size:2.37mm')
})

test('dividers are dashed or double', () => {
  const html = documentToHtml(doc())
  expect(html).toContain('border-top:0.3mm dashed')
  expect(html).toContain('border-top:0.7mm double')
})

test('the printable page is as wide as the paper and has no margins', () => {
  const page = documentToPage(doc())

  expect(page).toContain('@page { margin: 0; }')
  expect(page).toContain('width: 70mm')
  expect(page).toContain('<meta charset="utf-8">')
  expect(page).toContain('INV-000022')
})
