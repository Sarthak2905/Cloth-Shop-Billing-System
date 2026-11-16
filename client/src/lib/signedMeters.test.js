import { parseSignedMeters } from './signedMeters'

test('a signed length is turned into whole centimetres', () => {
  expect(parseSignedMeters('-2.5')).toBe(-250)
  expect(parseSignedMeters('+10')).toBe(1000)
  expect(parseSignedMeters('3')).toBe(300)
  expect(parseSignedMeters('- 2')).toBe(-200)
  expect(parseSignedMeters(' 0,75 ')).toBe(75)
})

test('anything that is not a length is refused', () => {
  for (const bad of ['', 'abc', '2.555', '--2', '1.2.3', '-']) {
    expect(parseSignedMeters(bad)).toBeNull()
  }
})

test('zero stays zero, never minus zero', () => {
  expect(parseSignedMeters('-0')).toBe(0)
  expect(parseSignedMeters('0')).toBe(0)
})
