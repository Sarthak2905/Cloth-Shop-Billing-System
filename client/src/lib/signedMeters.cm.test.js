import { parseSignedMeters } from './signedMeters'

test('a signed length can be given in centimetres or meters', () => {
  expect(parseSignedMeters('-80 cm')).toBe(-80)
  expect(parseSignedMeters('+1 m')).toBe(100)
  expect(parseSignedMeters('10 cm')).toBe(10)
  expect(parseSignedMeters('-2.5')).toBe(-250)
  expect(parseSignedMeters('2 kg')).toBeNull()
})
