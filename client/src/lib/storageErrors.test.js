import { describeDatabaseError, isStorageFull } from './storageErrors'

test('recognises a full-storage error, including one wrapped by the database library', () => {
  expect(isStorageFull({ name: 'QuotaExceededError' })).toBe(true)
  expect(
    isStorageFull({
      name: 'DexieError',
      inner: { name: 'QuotaExceededError' },
    }),
  ).toBe(true)
})

test('does not mistake other errors for full storage', () => {
  expect(isStorageFull(new Error('boom'))).toBe(false)
  expect(isStorageFull(null)).toBe(false)
})

test('explains why the database could not open in plain language', () => {
  expect(describeDatabaseError({ name: 'QuotaExceededError' })).toContain(
    'out of storage space',
  )
  expect(describeDatabaseError({ name: 'SecurityError' })).toContain(
    'blocking local storage',
  )
  expect(describeDatabaseError(new Error('Database is blocked'))).toContain(
    'another tab',
  )
  expect(describeDatabaseError(new Error('???'))).toContain('could not open')
})
