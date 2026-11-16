import { parseLength } from './quantity'

test('a number without a unit is meters', () => {
  expect(parseLength('2.25')).toBe(225)
  expect(parseLength('0.8')).toBe(80)
  expect(parseLength('0.80')).toBe(80)
  expect(parseLength('.5')).toBe(50)
  expect(parseLength('1,5')).toBe(150)
  expect(parseLength('2')).toBe(200)
})

test('0.1 m is 10 cm and 0.01 m is 1 cm', () => {
  expect(parseLength('0.1')).toBe(10)
  expect(parseLength('0.01')).toBe(1)
})

test('"m" and "cm" can be written after the number, in any case or spelling', () => {
  expect(parseLength('2.25 m')).toBe(225)
  expect(parseLength('2,25m')).toBe(225)
  expect(parseLength('2.25 Meters')).toBe(225)
  expect(parseLength('80 cm')).toBe(80)
  expect(parseLength('80cm')).toBe(80)
  expect(parseLength('90 CM')).toBe(90)
  expect(parseLength('80 centimetres')).toBe(80)
})

test('a unit written after the number wins over the default', () => {
  expect(parseLength('80 cm', 'm')).toBe(80)
  expect(parseLength('0.8 m', 'cm')).toBe(80)
})

test('with centimetres as the default, a bare number is centimetres and must be whole', () => {
  expect(parseLength('80', 'cm')).toBe(80)
  expect(parseLength('235', 'cm')).toBe(235)
  expect(parseLength('80.5', 'cm')).toBeNull()
  expect(parseLength('1,5', 'cm')).toBeNull()
})

test('zero is read as zero, and everything that is not a length is refused', () => {
  expect(parseLength('0')).toBe(0)
  expect(parseLength('0 cm')).toBe(0)
  for (const bad of [
    '',
    'abc',
    '2.555',
    '-1',
    '1.2.3',
    '2 kg',
    '80.5 cm',
    'cm',
  ]) {
    expect(parseLength(bad)).toBeNull()
  }
  expect(parseLength(null)).toBeNull()
})
