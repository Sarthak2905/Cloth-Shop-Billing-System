import { parseMoneyInput, parseWholeInput } from './entryInput'

test('amounts are turned into paise, with ₹ and commas allowed', () => {
  expect(parseMoneyInput('599')).toBe(59900)
  expect(parseMoneyInput('599.5')).toBe(59950)
  expect(parseMoneyInput('₹1,299.50')).toBe(129950)
  expect(parseMoneyInput(' 0 ')).toBe(0)
})

test('anything else is not an amount, and whole numbers are strict', () => {
  for (const bad of ['', 'abc', '5.999', '-5', '1.2.3'])
    expect(parseMoneyInput(bad)).toBeNull()

  expect(parseWholeInput('12')).toBe(12)
  expect(parseWholeInput('0')).toBe(0)
  for (const bad of ['', '1.5', '-1', 'x', '1000001'])
    expect(parseWholeInput(bad)).toBeNull()
})
