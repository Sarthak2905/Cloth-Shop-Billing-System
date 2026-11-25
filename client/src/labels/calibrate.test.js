import { buildCalibrateJob } from './calibrate'

test('the calibration job starts like a label job, so the helper accepts it', () => {
  const text = new TextDecoder().decode(
    buildCalibrateJob({ widthMm: 50, heightMm: 25, gapMm: 3 }),
  )
  expect(text.startsWith('SIZE 50 mm,25 mm')).toBe(true)
  expect(text).toContain('GAPDETECT')
})
