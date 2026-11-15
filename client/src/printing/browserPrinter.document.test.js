import { receiptToHtml } from './browserPrinter'

test('a receipt with a layout document is printed with that layout, not as plain text', () => {
  const receipt = {
    paperWidth: '80-42',
    width: 42,
    text: 'plain text version',
    document: {
      paperWidth: '80-42',
      language: 'en',
      textSize: 'large',
      blocks: [{ kind: 'row', left: 'TOTAL', right: '764.00' }],
    },
  }

  const html = receiptToHtml(receipt)

  expect(html).toContain('display:flex')
  expect(html).toContain('764.00')
  expect(html).not.toContain('<pre>')
  expect(html).not.toContain('plain text version')
})
