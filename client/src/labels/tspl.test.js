import { buildLabelJob, inkFromRgba, mmToDots, packBitmap } from './tspl'

const text = (bytes) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('')
const bitmap = (bytes, widthBytes, heightDots) => ({
  bytes: Uint8Array.from(bytes),
  widthBytes,
  heightDots,
})

test('millimetres become printer dots, 8 to a millimetre', () => {
  expect(mmToDots(50)).toBe(400)
  expect(mmToDots(25)).toBe(200)
  expect(mmToDots(1.5)).toBe(12)
  expect(mmToDots(38)).toBe(304)
})

test('a blank bitmap is all white (1 bits), and the width is rounded up to whole bytes', () => {
  const { bytes, widthBytes, heightDots } = packBitmap(
    new Uint8Array(10 * 2),
    10,
    2,
  )

  expect(widthBytes).toBe(2)
  expect(heightDots).toBe(2)
  expect([...bytes]).toEqual([255, 255, 255, 255])
})

test('a black dot clears its bit, and the leftmost dot is the highest bit', () => {
  const ink = new Uint8Array(16 * 2)
  ink[0] = 1 // row 0, dot 0
  ink[7] = 1 // row 0, dot 7
  ink[16 + 8] = 1 // row 1, dot 8

  const { bytes } = packBitmap(ink, 16, 2)

  expect([...bytes]).toEqual([0b01111110, 255, 255, 0b01111111])
})

test('the dots after the end of a row stay white', () => {
  const { bytes } = packBitmap(new Uint8Array(10).fill(1), 10, 1)

  expect([...bytes]).toEqual([0, 0b00111111])
})

test('dark dots become black, light and see-through dots become white', () => {
  const rgba = new Uint8ClampedArray([
    0,
    0,
    0,
    255, // black
    255,
    255,
    255,
    255, // white
    100,
    100,
    100,
    255, // dark grey
    200,
    200,
    200,
    255, // light grey
    0,
    0,
    0,
    0, // see-through
  ])

  expect([...inkFromRgba(rgba, 5, 1)]).toEqual([1, 0, 1, 0, 0])
})

test('a job sets the label size, then clears and prints each label with its copies, bytes untouched', () => {
  const job = buildLabelJob({
    widthMm: 50,
    heightMm: 25,
    labels: [
      { bitmap: bitmap([0x0d, 0x0a, 0xff, 0x00], 2, 2), copies: 3 },
      { bitmap: bitmap([1, 2], 1, 2), copies: 1 },
    ],
  })
  const out = text(job)

  expect(
    out.startsWith(
      'SIZE 50 mm,25 mm\r\nGAP 3 mm,0 mm\r\nDENSITY 8\r\nSPEED 4\r\nDIRECTION 1\r\n',
    ),
  ).toBe(true)
  expect(out).toContain('CLS\r\nBITMAP 0,0,2,2,0,\r\n\xff\x00\r\nPRINT 1,3\r\n')
  expect(out).toContain('CLS\r\nBITMAP 0,0,1,2,0,\x01\x02\r\nPRINT 1,1\r\n')
  expect(out.match(/CLS/g)).toHaveLength(2)
})

test('gap, darkness, direction and the move of the print are written into the job', () => {
  const out = text(
    buildLabelJob({
      widthMm: 38.5,
      heightMm: 25,
      gapMm: 2.5,
      density: 12,
      direction: 0,
      offsetXmm: 1,
      offsetYmm: 0.5,
      labels: [{ bitmap: bitmap([1, 2], 1, 2), copies: 1 }],
    }),
  )

  expect(out).toContain('SIZE 38.5 mm,25 mm')
  expect(out).toContain('GAP 2.5 mm,0 mm')
  expect(out).toContain('DENSITY 12')
  expect(out).toContain('DIRECTION 0')
  expect(out).toContain('BITMAP 8,4,1,2,0,')
})

test('copies and settings out of range are pulled into range', () => {
  const out = text(
    buildLabelJob({
      widthMm: 50,
      heightMm: 25,
      density: 99,
      direction: 5,
      labels: [
        { bitmap: bitmap([1], 1, 1), copies: 0 },
        { bitmap: bitmap([1], 1, 1), copies: 150 },
        { bitmap: bitmap([1], 1, 1), copies: 2.7 },
      ],
    }),
  )

  expect(out).toContain('DENSITY 15')
  expect(out).toContain('DIRECTION 1')
  expect(out).toContain('PRINT 1,1')
  expect(out).toContain('PRINT 1,99')
  expect(out).toContain('PRINT 1,3')
})

test('a job with no label or no size is refused', () => {
  expect(() =>
    buildLabelJob({ widthMm: 50, heightMm: 25, labels: [] }),
  ).toThrow('no label')
  expect(() =>
    buildLabelJob({
      widthMm: 0,
      heightMm: 25,
      labels: [{ bitmap: bitmap([1], 1, 1), copies: 1 }],
    }),
  ).toThrow('size')
})
