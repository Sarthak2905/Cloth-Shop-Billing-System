import { AppError } from '../lib/errors.js'
import { isValidEan13 } from './ean.js'

const cache = new Map()

// The printer (203 dpi) prints in whole dots. A bar that is 2.6 dots wide is printed as 2 or
// 3 dots, unevenly, which smears the barcode. So bars are made a whole number of dots wide.
const DPI = 203
export const MM_PER_DOT = 25.4 / DPI
export const QUIET_MODULES = 10 // empty space a scanner needs on each side, in bar widths

function checkBarcode(value, symbology) {
  if (symbology !== 'code128' && symbology !== 'ean13') {
    throw new AppError(
      'VALIDATION_ERROR',
      `Unsupported barcode type "${symbology}"`,
    )
  }
  if (symbology === 'ean13' && !isValidEan13(value)) {
    throw new AppError(
      'INVALID_EAN',
      'Not a valid EAN-13 number (check the last digit)',
    )
  }
}

// The widest whole number of dots per bar (4, 3 or 2) that fits the width in dots, empty
// sides included. If even 2 does not fit, 1 is used (the barcode may not scan well).
export function pickDotsForWidth(
  modules,
  availableDots,
  { max = 4, min = 2 } = {},
) {
  for (let dots = max; dots >= min; dots -= 1) {
    if ((modules + 2 * QUIET_MODULES) * dots <= availableDots) return dots
  }
  return 1
}

export function pickDotsPerBar(modules, availableMm, options) {
  return pickDotsForWidth(modules, availableMm / MM_PER_DOT, options)
}

// How many bar widths the barcode is (at scale 1, one bar width is one unit).
export function svgModules(svg) {
  const open = svg.match(/<svg\b[^>]*>/)?.[0] ?? ''
  const box = open.match(
    /viewBox="[\d.\-]+[\s,]+[\d.\-]+[\s,]+([\d.]+)[\s,]+[\d.]+"/,
  )
  const width = box?.[1] ?? open.match(/\swidth="([\d.]+)/)?.[1]
  const n = Number(width)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

// Makes the SVG fill the height of the box it is placed in. Adds a viewBox if missing and
// removes fixed pixel sizes. With `widthMm` the barcode gets exactly that width and is
// centred; without it, it stretches to the whole box. Stretching scales every bar by the
// same amount, so the barcode stays valid.
export function fitSvg(svg, { widthMm } = {}) {
  const open = svg.match(/<svg\b[^>]*>/)?.[0]
  if (!open) return svg

  let tag = open
  if (!/\sviewBox=/.test(tag)) {
    const width = tag.match(/\swidth="([\d.]+)/)?.[1]
    const height = tag.match(/\sheight="([\d.]+)/)?.[1]
    if (width && height)
      tag = tag.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`)
  }
  tag = tag.replace(/\s(?:width|height)="[^"]*"/g, '')

  const size = widthMm
    ? `width:${Number(widthMm).toFixed(3)}mm;height:100%;display:block;margin:0 auto`
    : 'width:100%;height:100%;display:block'
  if (/\sstyle="/.test(tag)) {
    tag = tag.replace(/\sstyle="/, ` style="${size};`)
  } else {
    tag = tag.replace('<svg', `<svg style="${size}"`)
  }

  tag = /preserveAspectRatio=/.test(tag)
    ? tag.replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"')
    : tag.replace('<svg', '<svg preserveAspectRatio="none"')

  // hard bar edges: no grey anti-aliasing between a bar and the empty space
  if (!/shape-rendering=/.test(tag)) {
    tag = tag.replace('<svg', '<svg shape-rendering="crispEdges"')
  }

  return svg.replace(open, tag)
}

// Gives a barcode picture an exact size in pixels (for drawing it on a canvas, where one
// pixel is one printer dot). The picture is stretched only to that size, with hard edges.
export function sizeSvg(svg, widthPx, heightPx) {
  const open = svg.match(/<svg\b[^>]*>/)?.[0]
  if (!open) return svg

  let tag = open
  let box = tag.match(/\sviewBox="([^"]*)"/)?.[1]
  if (!box) {
    const w = tag.match(/\swidth="([\d.]+)/)?.[1]
    const h = tag.match(/\sheight="([\d.]+)/)?.[1]
    if (w && h) box = `0 0 ${w} ${h}`
  }
  tag = tag.replace(
    /\s(?:width|height|viewBox|preserveAspectRatio|shape-rendering|style)="[^"]*"/g,
    '',
  )
  if (!/\sxmlns=/.test(tag))
    tag = tag.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  tag = tag.replace(
    '<svg',
    `<svg width="${widthPx}" height="${heightPx}"${box ? ` viewBox="${box}"` : ''} preserveAspectRatio="none" shape-rendering="crispEdges"`,
  )
  return svg.replace(open, tag)
}

// symbology: 'code128' | 'ean13'. Returns an SVG string.
// With `availableMm` (the width the barcode may use), the bars get a whole number of
// printer dots each and the barcode is centred. Without it, it stretches to fill its box.
export async function generateBarcodeSvg({
  value,
  symbology,
  heightMm = 10,
  availableMm = null,
}) {
  checkBarcode(value, symbology)

  const key = `${symbology}|${value}|${heightMm}|${availableMm ?? 'fill'}`
  if (!cache.has(key)) {
    // The library is loaded on first use, so it stays out of the main app bundle.
    cache.set(
      key,
      import('bwip-js').then((mod) => {
        const bwip = mod.default ?? mod
        const draw = (scale) =>
          bwip.toSVG({
            bcid: symbology,
            text: value,
            scale,
            height: heightMm, // bar height in millimetres
            includetext: false, // we print the number ourselves
          })

        if (availableMm) {
          const modules = svgModules(draw(1))
          if (modules) {
            const dots = pickDotsPerBar(modules, availableMm)
            return fitSvg(draw(dots), { widthMm: modules * dots * MM_PER_DOT })
          }
        }
        return fitSvg(draw(3))
      }),
    )
  }

  try {
    return await cache.get(key)
  } catch (err) {
    cache.delete(key) // do not remember a failure
    throw err
  }
}

// The barcode for direct printing: bars a whole number of dots wide, for a given width in
// dots. Returns { svg, modules, dots, widthDots }.
export async function rawBarcode({ value, symbology, availableDots }) {
  checkBarcode(value, symbology)
  const mod = await import('bwip-js')
  const bwip = mod.default ?? mod
  const draw = (scale) =>
    bwip.toSVG({
      bcid: symbology,
      text: value,
      scale,
      height: 10,
      includetext: false,
    })

  const modules = svgModules(draw(1))
  if (!modules)
    throw new AppError('BARCODE_FAILED', 'The barcode could not be drawn')
  const dots = pickDotsForWidth(modules, availableDots)
  return { svg: draw(dots), modules, dots, widthDots: modules * dots }
}
