import { AppError } from '../lib/errors.js'
import { isValidEan13 } from './ean.js'

const cache = new Map()

// Makes the SVG fill whatever box it is placed in: adds a viewBox if missing,
// lets it stretch to the box, and removes fixed pixel sizes. Stretching scales
// every bar by the same amount, so the barcode stays valid.
export function fitSvg(svg) {
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

  if (/\sstyle="/.test(tag)) {
    tag = tag.replace(
      /\sstyle="/,
      ' style="width:100%;height:100%;display:block;',
    )
  } else {
    tag = tag.replace(
      '<svg',
      '<svg style="width:100%;height:100%;display:block"',
    )
  }

  tag = /preserveAspectRatio=/.test(tag)
    ? tag.replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="none"')
    : tag.replace('<svg', '<svg preserveAspectRatio="none"')

  return svg.replace(open, tag)
}

// symbology: 'code128' | 'ean13'. Returns an SVG string.
export async function generateBarcodeSvg({ value, symbology, heightMm = 10 }) {
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

  const key = `${symbology}|${value}|${heightMm}`
  if (!cache.has(key)) {
    // The library is loaded on first use, so it stays out of the main app bundle.
    cache.set(
      key,
      import('bwip-js').then((mod) => {
        const bwip = mod.default ?? mod
        const raw = bwip.toSVG({
          bcid: symbology,
          text: value,
          scale: 3,
          height: heightMm, // bar height in millimetres
          includetext: false, // we print the number ourselves
        })
        return fitSvg(raw)
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
