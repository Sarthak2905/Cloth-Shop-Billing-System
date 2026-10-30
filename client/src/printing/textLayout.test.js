import {
  centerText,
  divider,
  twoColumns,
  visualLength,
  wrapText,
} from './textLayout'

test('counts what a person sees as one character, including Marathi', () => {
  expect(visualLength('abc')).toBe(3)
  expect(visualLength('कॉटन')).toBe(3)
})

test('wraps text at word boundaries', () => {
  expect(wrapText('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc'])
  expect(wrapText('aaa bbb ccc', 20)).toEqual(['aaa bbb ccc'])
})

test('breaks a word that is longer than the line', () => {
  expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
})

test('never splits a Marathi letter from its vowel sign', () => {
  const text = 'श्री साई कॉटन कलेक्शन आणि रेडीमेड वस्त्रालय'
  const lines = wrapText(text, 10)
  expect(lines.length).toBeGreaterThan(1)
  for (const line of lines) {
    expect(visualLength(line)).toBeLessThanOrEqual(10)
    expect(line).not.toMatch(/^\p{M}/u)
  }
  expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
})

test('twoColumns puts the right text at the right edge and wraps the left', () => {
  expect(twoColumns('Total', '719.00', 20)).toEqual([
    `Total${' '.repeat(9)}719.00`,
  ])

  const indented = twoColumns('1 x 799.00', '799.00', 32, 2)
  expect(indented[0].startsWith('  1 x')).toBe(true)
  expect(visualLength(indented[0])).toBe(32)

  const wrapped = twoColumns('A very long item name here', '99.00', 20)
  expect(wrapped.length).toBeGreaterThan(1)
  expect(wrapped.every((line) => visualLength(line) <= 20)).toBe(true)
  expect(wrapped.at(-1).endsWith('99.00')).toBe(true)
  expect(wrapped[0]).not.toContain('99.00')
})

test('centers text and draws dividers', () => {
  expect(centerText('abc', 9)).toEqual(['   abc'])
  expect(divider(5)).toBe('-----')
  expect(divider(3, '=')).toBe('===')
})
