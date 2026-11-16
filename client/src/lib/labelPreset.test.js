import {
  clearLabelPreset,
  readLabelPreset,
  setLabelPreset,
} from './labelPreset'

beforeEach(() => sessionStorage.clear())

test('a preset is read back, with copies limited to 1-99 and bad values dropped', () => {
  setLabelPreset({ a: 3, b: 250, c: 0, d: 'x', e: -4 })

  expect(readLabelPreset()).toEqual({ a: 3, b: 99 })
})

test('an old preset is ignored', () => {
  sessionStorage.setItem(
    'labelPreset',
    JSON.stringify({ at: Date.now() - 10 * 60 * 1000, copies: { a: 2 } }),
  )

  expect(readLabelPreset()).toEqual({})
})

test('clearing removes the preset', () => {
  setLabelPreset({ a: 3 })
  clearLabelPreset()

  expect(readLabelPreset()).toEqual({})
})
