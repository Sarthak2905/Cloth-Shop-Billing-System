// Asks the printer to measure the gap between stickers on the roll that is loaded.
export function buildCalibrateJob({ widthMm, heightMm, gapMm = 3 }) {
  return new TextEncoder().encode(
    `SIZE ${Number(widthMm)} mm,${Number(heightMm)} mm\r\nGAP ${Number(gapMm)} mm,0 mm\r\nGAPDETECT\r\n`,
  )
}
