import { vi } from 'vitest'
import { buildLabelPrintJob, buildTestPrintJob } from './printJob'

const text = (bytes) =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join('')
const tiny = (n) => ({
  bytes: Uint8Array.from([n]),
  widthBytes: 1,
  heightDots: 1,
})

test('every label is drawn once and printed with its own copies', async () => {
  const render = vi.fn(async (label) => tiny(label.n))

  const job = await buildLabelPrintJob({
    entries: [
      { label: { n: 65 }, copies: 2 },
      { label: { n: 66 }, copies: 5 },
    ],
    widthMm: 50,
    heightMm: 25,
    options: { gapMm: 2, direction: 0 },
    render,
  })

  const out = text(job)
  expect(render).toHaveBeenCalledTimes(2)
  expect(render).toHaveBeenCalledWith({ n: 65 }, { widthMm: 50, heightMm: 25 })
  expect(out).toContain('GAP 2 mm,0 mm')
  expect(out).toContain('DIRECTION 0')
  expect(out).toContain('BITMAP 0,0,1,1,0,A\r\nPRINT 1,2\r\n')
  expect(out).toContain('BITMAP 0,0,1,1,0,B\r\nPRINT 1,5\r\n')
})

test('nothing to print is refused', async () => {
  await expect(
    buildLabelPrintJob({
      entries: [],
      widthMm: 50,
      heightMm: 25,
      render: vi.fn(),
    }),
  ).rejects.toThrow('no label')
})

test('the test label is one label printed once', async () => {
  const render = vi.fn(() => tiny(84))

  const job = await buildTestPrintJob({ widthMm: 40, heightMm: 30, render })

  expect(render).toHaveBeenCalledWith({ widthMm: 40, heightMm: 30 })
  const out = text(job)
  expect(out).toContain('SIZE 40 mm,30 mm')
  expect(out).toContain('BITMAP 0,0,1,1,0,T\r\nPRINT 1,1\r\n')
})
