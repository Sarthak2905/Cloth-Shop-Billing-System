// Turns a receipt document into HTML. The same HTML is used for the on-screen
// preview and for the printer, so what you see is what prints.

// Printable width of the paper in millimetres.
// If the right edge of the printed receipt is cut off, make the number smaller.
export const PRINTABLE_MM = { 58: 46, 80: 70, '80-42': 70 }

// Letter height in millimetres on 80 mm paper. Narrower paper scales it down.
export const TEXT_SIZE_MM = { normal: 3.0, large: 3.6, extra: 4.2 }

// Fonts that Windows has for both English and Marathi.
const FONT = "'Nirmala UI','Mangal','Segoe UI',Arial,sans-serif"

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sizesOf(doc) {
  const widthMm = PRINTABLE_MM[doc.paperWidth] ?? 70
  const base = TEXT_SIZE_MM[doc.textSize] ?? TEXT_SIZE_MM.large
  const fontMm = Number((base * (widthMm / 70)).toFixed(2))
  return { widthMm, fontMm }
}

function blockHtml(block) {
  switch (block.kind) {
    case 'center':
      return `<div style="text-align:center;margin:0.4mm 0;overflow-wrap:anywhere;${
        block.bold ? 'font-weight:800;' : ''
      }${block.big ? 'font-size:1.2em;' : ''}">${escapeHtml(block.text)}</div>`

    case 'divider':
      return block.style === 'double'
        ? '<div style="border-top:0.7mm double #000;margin:1.2mm 0;"></div>'
        : '<div style="border-top:0.3mm dashed #000;margin:1.2mm 0;"></div>'

    case 'row':
      return (
        `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:2mm;margin:0.3mm 0;${
          block.indent ? 'padding-left:3mm;' : ''
        }${block.bold ? 'font-weight:800;' : ''}${block.big ? 'font-size:1.2em;' : ''}">` +
        `<span style="min-width:0;overflow-wrap:anywhere;">${escapeHtml(block.left)}</span>` +
        `<span style="white-space:nowrap;text-align:right;">${escapeHtml(block.right)}</span></div>`
      )

    case 'text':
      return `<div style="margin:0.4mm 0;overflow-wrap:anywhere;">${escapeHtml(block.text)}</div>`

    case 'spacer':
      return '<div style="height:2.5mm;"></div>'

    default:
      return ''
  }
}

// Just the receipt (used by the preview).
export function documentToHtml(doc) {
  const { widthMm, fontMm } = sizesOf(doc)
  const inner = doc.blocks.map(blockHtml).join('')
  return (
    `<div style="width:${widthMm}mm;box-sizing:border-box;font-family:${FONT};` +
    `font-size:${fontMm}mm;line-height:1.3;font-weight:600;color:#000;">${inner}</div>`
  )
}

// A whole page for the printer: as wide as the paper, with no margins.
export function documentToPage(doc) {
  const { widthMm } = sizesOf(doc)
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
body { width: ${widthMm}mm; margin: 0 auto; padding: 2mm 0 12mm 0; }
</style>
</head>
<body>${documentToHtml(doc)}</body>
</html>`
}
