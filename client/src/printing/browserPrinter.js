import { PrinterError } from './printerAdapter'
import { PRINTABLE_MM, documentToPage, escapeHtml } from './receiptHtml'

// The page that is sent to the printer. A receipt with a layout document is printed
// with the proper layout. A plain text receipt falls back to a fixed-width page.
export function receiptToHtml(receipt) {
  if (receipt.document) return documentToPage(receipt.document)

  const widthMm = PRINTABLE_MM[receipt.paperWidth] ?? 70
  // A courier-style font is 0.6 of its size wide, so the size is chosen to make
  // exactly `receipt.width` characters fill the printable width.
  const fontMm = (widthMm / (receipt.width * 0.6)).toFixed(3)

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { width: ${widthMm}mm; margin: 0 auto; padding: 2mm 0 12mm 0; }
pre {
  margin: 0;
  color: #000;
  font-family: "Courier New", Courier, monospace;
  font-weight: bold;
  font-size: ${fontMm}mm;
  line-height: 1.2;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
</head>
<body><pre>${escapeHtml(receipt.text)}</pre></body>
</html>`
}

// Prints a page of HTML through a hidden frame. It resolves once the print window
// has been shown (or, with silent printing, once the job was sent).
export function printHtml(html, { doc = document } = {}) {
  return new Promise((resolve, reject) => {
    const frame = doc.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'

    let finished = false
    const finish = (error) => {
      if (finished) return
      finished = true
      setTimeout(() => frame.remove(), 1000)
      if (error) reject(error)
      else resolve()
    }

    frame.onload = () => {
      try {
        const win = frame.contentWindow
        win.focus()
        win.addEventListener('afterprint', () => finish())
        win.print()
        setTimeout(() => finish(), 1500) // some browsers never report "afterprint"
      } catch (err) {
        finish(err)
      }
    }

    frame.srcdoc = html
    doc.body.appendChild(frame)
  })
}

// A printer adapter (see printerAdapter.js). It can only HAND OFF the receipt: the
// browser cannot tell whether paper actually came out, so we never claim more.
export function createBrowserPrinter({ print = printHtml } = {}) {
  return {
    id: 'browser',
    label: 'Windows printer',
    async print(receipt) {
      try {
        await print(receiptToHtml(receipt))
      } catch (err) {
        console.error(err)
        throw new PrinterError(
          'BROWSER_PRINT_FAILED',
          'The print window could not be opened. Try again, or check the printer in Windows.',
        )
      }
      return { confirmation: 'handed_off' }
    },
  }
}
