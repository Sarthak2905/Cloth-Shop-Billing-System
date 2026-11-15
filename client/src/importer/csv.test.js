import { parseCsv } from './csv'

test('reads simple rows', () => {
  expect(parseCsv('a,b\n1,2')).toEqual([
    ['a', 'b'],
    ['1', '2'],
  ])
})

test('reads quoted cells with commas, quotes and line breaks', () => {
  const rows = parseCsv(
    'name,note\n"Smith, J","He said ""hi"""\n"line1\nline2",x',
  )
  expect(rows).toEqual([
    ['name', 'note'],
    ['Smith, J', 'He said "hi"'],
    ['line1\nline2', 'x'],
  ])
})

test('drops the UTF-8 marker and understands Windows line endings', () => {
  expect(parseCsv('\uFEFFa,b\r\n1,2\r\n')).toEqual([
    ['a', 'b'],
    ['1', '2'],
  ])
})

test('detects semicolon and tab separated files', () => {
  expect(parseCsv('a;b;c\n1;2;3')).toEqual([
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ])
  expect(parseCsv('a\tb\n1\t2')).toEqual([
    ['a', 'b'],
    ['1', '2'],
  ])
})

test('keeps empty cells, including at the end of the last line', () => {
  expect(parseCsv('a,,c\n1,2,')).toEqual([
    ['a', '', 'c'],
    ['1', '2', ''],
  ])
})

test('a quote in the middle of a cell is just text', () => {
  expect(parseCsv('a,5" screen,c')).toEqual([['a', '5" screen', 'c']])
})
