import { pickDotsForWidth, rawBarcode, sizeSvg } from './barcodeSvg'

test('bars get the widest whole number of dots (4, 3 or 2) that fits with empty sides, else 1', () => {
  expect(pickDotsForWidth(60, 376)).toBe(4) // 80 x 4 = 320
  expect(pickDotsForWidth(95, 376)).toBe(3) // 115 x 3 = 345
  expect(pickDotsForWidth(134, 376)).toBe(2) // 154 x 2 = 308
  expect(pickDotsForWidth(300, 376)).toBe(1)
})

test('sizeSvg gives the picture an exact size in pixels with hard edges', () => {
  const out = sizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 134 20" width="134" height="20" style="x:y"><path d="M0 0h2v20h-2z"/></svg>',
    268,
    80,
  )

  expect(out).toContain('width="268"')
  expect(out).toContain('height="80"')
  expect(out).toContain('viewBox="0 0 134 20"')
  expect(out).toContain('preserveAspectRatio="none"')
  expect(out).toContain('shape-rendering="crispEdges"')
  expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
  expect(out).not.toContain('width="134"')
  expect(out).not.toContain('style=')
})

test('without a viewBox it is made from the old width and height, and a missing xmlns is added', () => {
  const out = sizeSvg(
    '<svg width="134" height="20"><path d="M0 0h2v20h-2z"/></svg>',
    268,
    80,
  )

  expect(out).toContain('viewBox="0 0 134 20"')
  expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
})

test('text that is not an svg is returned as it is', () => {
  expect(sizeSvg('nothing', 10, 10)).toBe('nothing')
})

test('a real Code 128 barcode gets bars a whole number of dots wide that fit the label', async () => {
  const code = await rawBarcode({
    value: 'CLO000024',
    symbology: 'code128',
    availableDots: 376,
  })

  expect(code.modules).toBeGreaterThan(90)
  expect(code.modules).toBeLessThan(140)
  expect(code.dots).toBe(2)
  expect(code.widthDots).toBe(code.modules * code.dots)
  expect((code.modules + 20) * code.dots).toBeLessThanOrEqual(376)
  expect(code.svg).toContain('<svg')
})

test('an unsupported barcode type or a wrong EAN number is refused', async () => {
  await expect(
    rawBarcode({ value: '1', symbology: 'qr', availableDots: 376 }),
  ).rejects.toMatchObject({
    code: 'VALIDATION_ERROR',
  })
  await expect(
    rawBarcode({
      value: '1234567890123',
      symbology: 'ean13',
      availableDots: 376,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_EAN' })
})
