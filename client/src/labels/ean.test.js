import { chooseSymbology, eanCheckDigit, isValidEan13 } from './ean'

test('calculates EAN-13 check digits', () => {
  expect(eanCheckDigit('400638133393')).toBe(1)
  expect(eanCheckDigit('590123412345')).toBe(7)
  expect(() => eanCheckDigit('123')).toThrow()
})

test('validates whole EAN-13 numbers', () => {
  expect(isValidEan13('4006381333931')).toBe(true)
  expect(isValidEan13('5901234123457')).toBe(true)
  expect(isValidEan13('4006381333932')).toBe(false)
  expect(isValidEan13('123')).toBe(false)
  expect(isValidEan13('ABCDEFGHIJKLM')).toBe(false)
  expect(isValidEan13('40063813339310')).toBe(false)
})

test('uses Code 128 for internal codes and other lengths', () => {
  expect(chooseSymbology('CLO000001')).toEqual({
    symbology: 'code128',
    warning: null,
  })
  expect(chooseSymbology('12345678')).toEqual({
    symbology: 'code128',
    warning: null,
  })
})

test('uses EAN-13 only for a valid 13-digit number and warns about a bad check digit', () => {
  expect(chooseSymbology('4006381333931')).toEqual({
    symbology: 'ean13',
    warning: null,
  })
  const bad = chooseSymbology('4006381333932')
  expect(bad.symbology).toBe('code128')
  expect(bad.warning).toContain('check digit')
})
