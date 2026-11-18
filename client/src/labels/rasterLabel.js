import { rawBarcode, sizeSvg } from './barcodeSvg'
import { inkFromRgba, mmToDots, packBitmap } from './tspl'

// The label is drawn on a canvas that is exactly as many pixels as the printer has dots,
// then turned into black and white dots. Marathi names work because it is a picture.
const FONT =
  '"Nirmala UI", "Noto Sans Devanagari", "Segoe UI", Arial, sans-serif'
const MONO = 'Consolas, "Courier New", monospace'

function defaultCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function defaultLoadImage(svg) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () =>
      reject(new Error('The barcode picture could not be prepared'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

// Shrinks the text until it fits the width, and cuts it with "…" if it still does not fit.
export function fitText(
  ctx,
  text,
  maxWidth,
  { size, minSize, weight = 'normal', family = FONT },
) {
  const font = (n) => `${weight} ${n}px ${family}`
  let current = size
  ctx.font = font(current)
  while (ctx.measureText(text).width > maxWidth && current > minSize) {
    current -= 1
    ctx.font = font(current)
  }
  let out = text
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth)
      out = out.slice(0, -1)
    out = `${out}…`
  }
  return { text: out, size: current, font: font(current) }
}

function finish(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height)
  return packBitmap(inkFromRgba(data, width, height), width, height)
}

// Draws one label. Returns { bytes, widthBytes, heightDots } for the printer.
export async function renderLabelBitmap(
  label,
  {
    widthMm,
    heightMm,
    createCanvas = defaultCanvas,
    loadImage = defaultLoadImage,
  },
) {
  const width = mmToDots(widthMm)
  const height = mmToDots(heightMm)
  const ctx = createCanvas(width, height).getContext('2d', {
    willReadFrequently: true,
  })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  const pad = mmToDots(1.5)
  const inner = width - 2 * pad
  let y = pad

  const title = fitText(ctx, label.title, inner, {
    size: 24,
    minSize: 14,
    weight: 'bold',
  })
  ctx.font = title.font
  ctx.fillText(title.text, pad, y)
  y += title.size + 3

  if (label.detail) {
    const detail = fitText(ctx, label.detail, inner, { size: 20, minSize: 13 })
    ctx.font = detail.font
    ctx.fillText(detail.text, pad, y)
    y += detail.size + 3
  }

  // the barcode: bars a whole number of dots wide, centred, as tall as the space allows
  const bottomRow = 20
  const barTop = y + 2
  const barHeight = Math.max(30, height - pad - bottomRow - 4 - barTop)
  const code = await rawBarcode({
    value: label.barcode,
    symbology: label.symbology,
    availableDots: inner,
  })
  const image = await loadImage(sizeSvg(code.svg, code.widthDots, barHeight))
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(image, Math.round((width - code.widthDots) / 2), barTop)

  // the barcode number on the left, the price on the right
  const rowY = height - pad - bottomRow
  let priceWidth = 0
  if (label.priceText) {
    const price = fitText(ctx, label.priceText, Math.round(inner * 0.5), {
      size: 20,
      minSize: 13,
      weight: 'bold',
    })
    ctx.font = price.font
    ctx.textAlign = 'right'
    ctx.fillText(price.text, width - pad, rowY)
    ctx.textAlign = 'left'
    priceWidth = ctx.measureText(price.text).width
  }
  const number = fitText(ctx, label.barcode, inner - priceWidth - 8, {
    size: 19,
    minSize: 12,
    family: MONO,
  })
  ctx.font = number.font
  ctx.fillText(number.text, pad, rowY)

  return finish(ctx, width, height)
}

// A test label: a box around the whole label, an arrow marked TOP, and the label size.
// It shows at a glance whether the label is the right way up and fits the sticker.
export function renderTestBitmap({
  widthMm,
  heightMm,
  createCanvas = defaultCanvas,
}) {
  const width = mmToDots(widthMm)
  const height = mmToDots(heightMm)
  const ctx = createCanvas(width, height).getContext('2d', {
    willReadFrequently: true,
  })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)

  const pad = mmToDots(2)
  ctx.beginPath()
  ctx.moveTo(pad + 14, pad)
  ctx.lineTo(pad + 28, pad + 18)
  ctx.lineTo(pad, pad + 18)
  ctx.closePath()
  ctx.fill()

  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.font = `bold 24px ${FONT}`
  ctx.fillText('TOP', pad + 38, pad - 1)

  ctx.textAlign = 'center'
  ctx.font = `bold 30px ${FONT}`
  ctx.fillText(
    `${widthMm} x ${heightMm} mm`,
    width / 2,
    Math.round(height / 2) - 12,
  )
  ctx.font = `18px ${FONT}`
  ctx.fillText('Label printer test', width / 2, height - pad - 20)

  return finish(ctx, width, height)
}
