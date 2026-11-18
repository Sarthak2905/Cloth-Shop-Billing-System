import {
  MM_PER_DOT,
  fitSvg,
  generateBarcodeSvg,
  pickDotsPerBar,
  svgModules,
} from './barcodeSvg'

test('bars get the widest whole number of printer dots that fits, empty sides included', () => {
  expect(pickDotsPerBar(112, 47)).toBe(2)
  expect(pickDotsPerBar(134, 47)).toBe(2)
  expect(pickDotsPerBar(95, 47)).toBe(3)
  expect(pickDotsPerBar(40, 100)).toBe(4)
})

test('a barcode that does not fit even with 2 dots per bar falls back to 1 dot', () => {
  expect(pickDotsPerBar(134, 25)).toBe(1)
})

test('the number of bar widths is read from the svg', () => {
  expect(
    svgModules('<svg viewBox="0 0 112 40" width="112" height="40"></svg>'),
  ).toBe(112)
  expect(svgModules('<svg width="95" height="30"></svg>')).toBe(95)
  expect(svgModules('<svg></svg>')).toBeNull()
  expect(svgModules('not an svg')).toBeNull()
})

test('with a width in millimetres the barcode is exactly that wide and centred, with hard edges', () => {
  const out = fitSvg(
    '<svg viewBox="0 0 100 40" width="100" height="40"><rect/></svg>',
    { widthMm: 33.5 },
  )

  expect(out).toContain('width:33.500mm')
  expect(out).toContain('margin:0 auto')
  expect(out).toContain('height:100%')
  expect(out).toContain('shape-rendering="crispEdges"')
  expect(out).toContain('preserveAspectRatio="none"')
  expect(out).not.toMatch(/\swidth="/)
})

test('without a width it still stretches to fill its box', () => {
  const out = fitSvg(
    '<svg viewBox="0 0 100 40" width="100" height="40"><rect/></svg>',
  )

  expect(out).toContain('width:100%')
  expect(out).toContain('height:100%')
})

test('the real barcode of a 50 mm label has bars that are a whole number of dots wide', async () => {
  const svg = await generateBarcodeSvg({
    value: 'CLO000024',
    symbology: 'code128',
    heightMm: 9,
    availableMm: 47,
  })

  const widthMm = Number(svg.match(/width:([\d.]+)mm/)[1])
  const dots = widthMm / MM_PER_DOT
  expect(Math.abs(dots - Math.round(dots))).toBeLessThan(0.01)
  expect(widthMm).toBeLessThanOrEqual(47)
  expect(widthMm).toBeGreaterThan(20)
  expect(svg).toContain('shape-rendering="crispEdges"')
})

test('without an available width the barcode still stretches, as before', async () => {
  const svg = await generateBarcodeSvg({
    value: 'CLO000024',
    symbology: 'code128',
    heightMm: 9,
  })

  expect(svg).toContain('width:100%')
})
