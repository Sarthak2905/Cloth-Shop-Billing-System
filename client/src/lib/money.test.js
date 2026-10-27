import { rupeesToPaise, paiseToRupees } from './money'

test('converts rupees to paise without float errors', () => {
  expect(rupeesToPaise('499')).toBe(49900)
  expect(rupeesToPaise('499.5')).toBe(49950)
  expect(rupeesToPaise('0.05')).toBe(5)
  expect(rupeesToPaise('19.99')).toBe(1999)
})

test('rejects invalid amounts', () => {
  expect(() => rupeesToPaise('abc')).toThrow()
  expect(() => rupeesToPaise('-5')).toThrow()
  expect(() => rupeesToPaise('1.234')).toThrow()
  expect(() => rupeesToPaise('')).toThrow()
})

test('formats paise as rupees', () => {
  expect(paiseToRupees(49950)).toBe('499.50')
  expect(paiseToRupees(5)).toBe('0.05')
})
