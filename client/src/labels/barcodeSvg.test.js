import { fitSvg, generateBarcodeSvg } from './barcodeSvg'

test('fitSvg adds a viewBox and lets the bars stretch to their box', () => {
  const out = fitSvg(
    '<svg width="100" height="50" xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
  )
  expect(out).toContain('viewBox="0 0 100 50"')
  expect(out).toContain('preserveAspectRatio="none"')
  expect(out).toContain('width:100%')
  expect(out).not.toContain('width="100"')
  expect(out).toContain('<rect/>')
})

test('fitSvg keeps an existing viewBox and style', () => {
  const out = fitSvg('<svg viewBox="0 0 10 5" style="color:red"><rect/></svg>')
  expect(out.match(/viewBox=/g)).toHaveLength(1)
  expect(out).toContain('color:red')
  expect(out).toContain('width:100%')
})

test('draws a Code 128 barcode as SVG', async () => {
  const svg = await generateBarcodeSvg({
    value: 'CLO000001',
    symbology: 'code128',
    heightMm: 8,
  })
  expect(svg).toContain('<svg')
  expect(svg).toContain('preserveAspectRatio="none"')
})

test('draws a valid EAN-13 barcode as SVG', async () => {
  const svg = await generateBarcodeSvg({
    value: '4006381333931',
    symbology: 'ean13',
    heightMm: 8,
  })
  expect(svg).toContain('<svg')
})

test('refuses an EAN-13 with a wrong check digit', async () => {
  await expect(
    generateBarcodeSvg({ value: '4006381333932', symbology: 'ean13' }),
  ).rejects.toMatchObject({ code: 'INVALID_EAN' })
})
