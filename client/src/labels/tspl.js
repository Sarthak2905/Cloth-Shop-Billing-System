// Direct printing for TSC label printers (TTP-244 Pro and similar). The label is drawn as a
// picture at the printer's own resolution and sent as TSPL commands, so the Windows driver's
// paper size and orientation do not matter.

export const DOTS_PER_MM = 8 // a 203 dpi printer
export const mmToDots = (mm) => Math.round(Number(mm) * DOTS_PER_MM)

// `ink`: one entry per dot, row by row, 1 = black, 0 = white.
// TSPL bitmap bytes: 8 dots per byte, the leftmost dot is the highest bit,
// a 0 bit is a printed (black) dot and a 1 bit is an empty (white) dot.
export function packBitmap(ink, widthDots, heightDots) {
  const widthBytes = Math.ceil(widthDots / 8)
  const bytes = new Uint8Array(widthBytes * heightDots).fill(0xff)
  for (let y = 0; y < heightDots; y += 1) {
    for (let x = 0; x < widthDots; x += 1) {
      if (ink[y * widthDots + x]) {
        bytes[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7))
      }
    }
  }
  return { bytes, widthBytes, heightDots }
}

// Pixels of a canvas (RGBA, 4 numbers per dot) -> black or white dots. Dark is black, and
// see-through counts as white.
export function inkFromRgba(rgba, widthDots, heightDots, threshold = 160) {
  const ink = new Uint8Array(widthDots * heightDots)
  for (let i = 0; i < ink.length; i += 1) {
    const alpha = rgba[i * 4 + 3] / 255
    const luminance =
      (0.299 * rgba[i * 4] +
        0.587 * rgba[i * 4 + 1] +
        0.114 * rgba[i * 4 + 2]) *
        alpha +
      255 * (1 - alpha)
    ink[i] = luminance < threshold ? 1 : 0
  }
  return ink
}

function clamp(value, low, high, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback
}

// One print job: the label size, then every label as a picture with its number of copies.
// labels: [{ bitmap: { bytes, widthBytes, heightDots }, copies }]
// direction: 1 normal, 0 turned upside-down.
export function buildLabelJob({
  widthMm,
  heightMm,
  gapMm = 3,
  density = 8,
  speed = 4,
  direction = 1,
  offsetXmm = 0,
  offsetYmm = 0,
  labels,
}) {
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new Error('There is no label to print')
  }
  if (!(Number(widthMm) > 0) || !(Number(heightMm) > 0)) {
    throw new Error('The label size is not valid')
  }

  const encoder = new TextEncoder()
  const parts = []
  const add = (text) => parts.push(encoder.encode(text))
  const x = mmToDots(clamp(offsetXmm, 0, 20, 0))
  const y = mmToDots(clamp(offsetYmm, 0, 20, 0))

  add(`SIZE ${Number(widthMm)} mm,${Number(heightMm)} mm\r\n`)
  add(`GAP ${clamp(gapMm, 0, 20, 3)} mm,0 mm\r\n`)
  add(`DENSITY ${Math.round(clamp(density, 0, 15, 8))}\r\n`)
  add(`SPEED ${Math.round(clamp(speed, 1, 10, 4))}\r\n`)
  add(`DIRECTION ${direction === 0 ? 0 : 1}\r\n`)
  for (const { bitmap, copies } of labels) {
    add('CLS\r\n')
    add(`BITMAP ${x},${y},${bitmap.widthBytes},${bitmap.heightDots},0,`)
    parts.push(bitmap.bytes)
    add(`\r\nPRINT 1,${Math.round(clamp(copies, 1, 99, 1))}\r\n`)
  }

  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}
