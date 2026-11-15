import { vi } from 'vitest'
import { createBrowserPrinter, receiptToHtml } from './browserPrinter'

const receipt = {
  paperWidth: '80-42',
  width: 42,
  text: 'Tom & <Jerry> Shop\nTOTAL 10.00',
}

test('the receipt page is sized to the paper and its text is made safe', () => {
  const html = receiptToHtml(receipt)

  expect(html).toContain('Tom &amp; &lt;Jerry&gt; Shop')
  expect(html).toContain('TOTAL 10.00')
  expect(html).not.toContain('<Jerry>')
  expect(html).toContain('@page { margin: 0; }')
  expect(html).toContain('width: 70mm')
  // 70 mm divided by (42 characters x 0.6) is 2.778 mm per character size
  expect(html).toContain('font-size: 2.778mm')
})

test('the browser printer hands the receipt over and says only that it was handed over', async () => {
  const print = vi.fn(async () => {})
  const printer = createBrowserPrinter({ print })

  const result = await printer.print(receipt)

  expect(result).toEqual({ confirmation: 'handed_off' })
  expect(print).toHaveBeenCalledTimes(1)
  expect(print.mock.calls[0][0]).toContain('TOTAL 10.00')
})

test('a print window that cannot be opened becomes a clear printer error', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const printer = createBrowserPrinter({
    print: vi.fn(async () => {
      throw new Error('blocked')
    }),
  })

  await expect(printer.print(receipt)).rejects.toMatchObject({
    code: 'BROWSER_PRINT_FAILED',
  })
  spy.mockRestore()
})
