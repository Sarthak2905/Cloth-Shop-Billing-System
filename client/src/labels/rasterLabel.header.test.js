import { renderLabelBitmap } from './rasterLabel'

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
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    getImageData: (x, y, w, h) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(255),
    }),
  }
  return { canvas: { width, height, getContext: () => ctx }, ctx, calls }
}

async function render(label) {
  const made = {}
  await renderLabelBitmap(label, {
    widthMm: 50,
    heightMm: 25,
    createCanvas: (w, h) => {
      Object.assign(made, fakeCanvas(w, h))
      return made.canvas
    },
    loadImage: async (svg) => ({ svg }),
  })
  return made.calls
}

const label = (over = {}) => ({
  title: 'Pant',
  detail: '',
  barcode: 'CLO000108',
  symbology: 'code128',
  priceText: 'MRP ₹350.00',
  ...over,
})
const texts = (calls) => calls.filter((c) => c[0] === 'fillText')
const textOf = (calls, value) => texts(calls).find((c) => c[1] === value)

test('the name is drawn first, at the top, centred, in bold', async () => {
  const calls = await render(label({ header: 'SG Dhokate' }))

  const [first] = texts(calls)
  expect(first[1]).toBe('SG Dhokate')
  expect(first[2]).toBe(200) // the middle of a 400 dot wide label
  expect(first[3]).toBe(12) // the top margin
  expect(first[4]).toContain('bold')
  expect(first[5]).toBe('center')
})

test('the item name moves down to make room, and is still on the left', async () => {
  const plain = await render(label())
  const withName = await render(label({ header: 'SG Dhokate' }))

  const before = textOf(plain, 'Pant')
  const after = textOf(withName, 'Pant')
  expect(before[3]).toBe(12)
  expect(after[3]).toBeGreaterThan(before[3])
  expect(after[2]).toBe(12)
  expect(after[5]).toBe('left')
})

test('the barcode starts lower, but still fits above the number and the price', async () => {
  const plain = await render(label())
  const withName = await render(
    label({ header: 'SG Dhokate', detail: 'Size M' }),
  )

  const top = (calls) => calls.find((c) => c[0] === 'drawImage')[3]
  expect(top(withName)).toBeGreaterThan(top(plain))
  const barHeight = Number(
    withName
      .find((c) => c[0] === 'drawImage')[1]
      .svg.match(/height="(\d+)"/)[1],
  )
  expect(barHeight).toBeGreaterThanOrEqual(30)
  expect(top(withName) + barHeight).toBeLessThan(
    textOf(withName, 'CLO000108')[3],
  )
})

test('without a name the label is exactly as before', async () => {
  const calls = await render(label())

  expect(texts(calls).map((c) => c[1])).toEqual([
    'Pant',
    'MRP ₹35.00'.replace('35', '350'),
    'CLO000108',
  ])
  expect(textOf(calls, 'Pant')[3]).toBe(12)
  expect(texts(calls).every((c) => c[5] !== 'center')).toBe(true)
})

test('a name that is too wide gets smaller, and a very long one is cut with "…"', async () => {
  const fits = textOf(
    await render(label({ header: 'SG Dhokate' })),
    'SG Dhokate',
  )
  expect(fits[4]).toContain('22px')

  const wide = await render(label({ header: 'A'.repeat(40) }))
  const shrunk = texts(wide)[0]
  expect(Number(/(\d+)px/.exec(shrunk[4])[1])).toBeLessThan(22)

  const huge = await render(label({ header: 'A'.repeat(200) }))
  expect(texts(huge)[0][1].endsWith('…')).toBe(true)
})
