import { UNLOCK_DAYS, clearUnlock, loadUnlock, saveUnlock } from './unlock'

const user = {
  id: 'u1',
  username: 'owner',
  displayName: 'Shop Owner',
  role: 'admin',
}
const T0 = Date.parse('2026-11-19T10:00:00.000Z')
const DAY = 86_400_000

beforeEach(() => localStorage.clear())

test('a signed-in computer stays open for 14 days', () => {
  const record = saveUnlock(user, { now: T0 })

  expect(UNLOCK_DAYS).toBe(14)
  expect(record.until).toBe(T0 + 14 * DAY)
  expect(loadUnlock(T0 + 13 * DAY)).toMatchObject({
    username: 'owner',
    displayName: 'Shop Owner',
    role: 'admin',
  })
})

test('after 14 days it asks again, and the old record is removed', () => {
  saveUnlock(user, { now: T0 })

  expect(loadUnlock(T0 + 15 * DAY)).toBeNull()
  expect(localStorage.getItem('clothing-pos-unlock')).toBeNull()
})

test('Lock removes it, and nothing saved means locked', () => {
  expect(loadUnlock()).toBeNull()

  saveUnlock(user)
  clearUnlock()

  expect(loadUnlock()).toBeNull()
})

test('a damaged record counts as locked', () => {
  localStorage.setItem('clothing-pos-unlock', '{broken')
  expect(loadUnlock()).toBeNull()

  localStorage.setItem('clothing-pos-unlock', JSON.stringify({ nothing: true }))
  expect(loadUnlock()).toBeNull()
  expect(localStorage.getItem('clothing-pos-unlock')).toBeNull()
})
