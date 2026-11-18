import { fitText, renderLabelBitmap, renderTestBitmap } from './rasterLabel'

// A canvas that only records what is drawn. Text is as wide as 0.6 x its font size per letter.
function fakeCanvas(width, height) {
  const calls = []
  const ctx = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    textBaseline: '',
    textAlign: 'left',
    lineWidth: 0,
    imageSmoothingEnabled: true,
    measureText: (text) => ({
      width:
        [...text].length * (Number(/(\d+)px/.exec(ctx.font)?.[1]) || 10) * 0.6,
    }),
    fillRect: (...a) => calls.push(['fillRect', ...a]),
    strokeRect: (...a) => calls.push(['strokeRect', ...a]),
    fillText: (text, x, y) =>
      calls.push(['fillText', text, x, y, ctx.font, ctx.textAlign]),
    drawImage: (...a) => calls.push(['drawImage', ...a]),
    beginPath: () => calls.push(['beginPath']),
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => calls.push(['fill']),
    getImageData: (x, y, w, h) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(255),
    }),
  }
  return { canvas: { width, height, getContext: () => ctx }, ctx, calls }
}

function setup() {
  const made = {}
  return {
    made,
    createCanvas: (w, h) => {
      Object.assign(made, fakeCanvas(w, h))
      return made.canvas
    },
    loadImage: async (svg) => ({ svg }),
  }
}

const label = (over = {}) => ({
  title: 'Astr',
  detail: '',
  barcode: 'CLO000024',
  symbology: 'code128',
  priceText: 'MRP ₹35.00',
  ...over,
})
const SIZE = { widthMm: 50, heightMm: 25 }
const drawn = (made, kind) => made.calls.filter((c) => c[0] === kind)

test('text that fits is left alone, text that is too wide shrinks, and the rest is cut with "…"', () => {
  const { ctx } = fakeCanvas(10, 10)

  expect(fitText(ctx, 'abc', 100, { size: 20, minSize: 10 })).toMatchObject({
    text: 'abc',
    size: 20,
  })

  const shrunk = fitText(ctx, 'a'.repeat(10), 100, { size: 20, minSize: 10 })
  expect(shrunk.size).toBeLessThan(20)
  expect(shrunk.text).toBe('a'.repeat(10))

  const cut = fitText(ctx, 'a'.repeat(100), 100, { size: 20, minSize: 10 })
  expect(cut.size).toBe(10)
  expect(cut.text.endsWith('…')).toBe(true)
  expect(cut.text.length).toBeLessThan(100)
})

test('a 50 x 25 mm label is 400 x 200 dots: 50 bytes wide, 200 rows, all white when nothing dark is drawn', async () => {
  const { made, createCanvas, loadImage } = setup()

  const bitmap = await renderLabelBitmap(label(), {
    ...SIZE,
    createCanvas,
    loadImage,
  })

  expect(bitmap).toMatchObject({ widthBytes: 50, heightDots: 200 })
  expect(bitmap.bytes).toHaveLength(50 * 200)
  expect(bitmap.bytes.every((b) => b === 255)).toBe(true)
  expect(made.canvas.width).toBe(400)
  expect(made.canvas.height).toBe(200)
})

test('the name is at the top left, an item without a size has no size line, Marathi is kept as typed', async () => {
  const { made, createCanvas, loadImage } = setup()
  await renderLabelBitmap(label({ title: 'कॉटन शर्ट' }), {
    ...SIZE,
    createCanvas,
    loadImage,
  })

  const texts = drawn(made, 'fillText')
  expect(texts[0].slice(1, 3)).toEqual(['कॉटन शर्ट', 12])
  expect(texts.map((t) => t[1])).not.toContain('Size M')
})

test('the barcode is centred and a whole number of dots wide, and sits lower when there is a size line', async () => {
  const plain = setup()
  await renderLabelBitmap(label(), {
    ...SIZE,
    createCanvas: plain.createCanvas,
    loadImage: plain.loadImage,
  })
  const withDetail = setup()
  await renderLabelBitmap(label({ detail: 'Size M' }), {
    ...SIZE,
    createCanvas: withDetail.createCanvas,
    loadImage: withDetail.loadImage,
  })

  const [, , x, top] = drawn(plain.made, 'drawImage')[0]
  const widthDots = Number(
    drawn(plain.made, 'drawImage')[0][1].svg.match(/width="(\d+)"/)[1],
  )
  expect(x).toBe(Math.round((400 - widthDots) / 2))
  expect(widthDots % 2).toBe(0) // 2 dots per bar on a 50 mm label
  expect(plain.made.ctx.imageSmoothingEnabled).toBe(false)
  expect(drawn(withDetail.made, 'drawImage')[0][3]).toBeGreaterThan(top)
  expect(drawn(withDetail.made, 'fillText').map((t) => t[1])).toContain(
    'Size M',
  )
})

test('the barcode number is at the bottom left and the price at the bottom right', async () => {
  const { made, createCanvas, loadImage } = setup()
  await renderLabelBitmap(label(), { ...SIZE, createCanvas, loadImage })

  const texts = drawn(made, 'fillText')
  const price = texts.find((t) => t[1] === 'MRP ₹35.00')
  const number = texts.find((t) => t[1] === 'CLO000024')
  expect(price[2]).toBe(388)
  expect(price[5]).toBe('right')
  expect(number[2]).toBe(12)
  expect(number[5]).toBe('left')
  expect(number[3]).toBe(price[3])
})

test('a very long name is cut instead of running off the label', async () => {
  const { made, createCanvas, loadImage } = setup()
  await renderLabelBitmap(label({ title: 'A'.repeat(100) }), {
    ...SIZE,
    createCanvas,
    loadImage,
  })

  expect(drawn(made, 'fillText')[0][1].endsWith('…')).toBe(true)
})

test('the test label has a box, an arrow, TOP and the label size', () => {
  const { made, createCanvas } = setup()

  const bitmap = renderTestBitmap({ ...SIZE, createCanvas })

  expect(bitmap).toMatchObject({ widthBytes: 50, heightDots: 200 })
  expect(drawn(made, 'strokeRect')).toHaveLength(1)
  expect(drawn(made, 'fill')).toHaveLength(1)
  expect(drawn(made, 'fillText').map((t) => t[1])).toEqual(
    expect.arrayContaining(['TOP', '50 x 25 mm']),
  )
})
