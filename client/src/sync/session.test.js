import {
  SESSION_KEY,
  clearSession,
  isExpired,
  loadSession,
  saveSession,
  tokenExpiry,
} from './session'

const fakeJwt = (payload) => {
  const encode = (value) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`
}

beforeEach(() => {
  localStorage.clear()
})

test('saves, loads and clears a session', () => {
  expect(loadSession()).toBeNull()
  expect(saveSession({ token: 'abc', user: { displayName: 'Owner' } })).toBe(
    true,
  )
  expect(loadSession()).toMatchObject({
    token: 'abc',
    user: { displayName: 'Owner' },
  })
  clearSession()
  expect(loadSession()).toBeNull()
})

test('ignores a damaged or empty stored session', () => {
  localStorage.setItem(SESSION_KEY, '{not json')
  expect(loadSession()).toBeNull()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ nothing: true }))
  expect(loadSession()).toBeNull()
})

test('reads the expiry time from a login token', () => {
  expect(tokenExpiry(fakeJwt({ exp: 2_000_000_000 }))).toBe(
    2_000_000_000 * 1000,
  )
  expect(tokenExpiry('garbage')).toBeNull()
  expect(tokenExpiry(fakeJwt({}))).toBeNull()
})

test('knows when a session has expired', () => {
  const now = Date.parse('2026-11-05T10:00:00Z')
  const seconds = now / 1000
  expect(isExpired({ token: fakeJwt({ exp: seconds - 10 }) }, now)).toBe(true)
  expect(isExpired({ token: fakeJwt({ exp: seconds + 3600 }) }, now)).toBe(
    false,
  )
  expect(isExpired({ token: 'no-expiry-inside' }, now)).toBe(false)
})
