import { webcrypto } from 'node:crypto'
import {
  MAX_OFFLINE_FAILURES,
  OFFLINE_LOCK_MS,
  clearVerifier,
  hasVerifier,
  saveVerifier,
  verifyOffline,
} from './passwordVerifier'

// Node's own crypto, so these tests do not depend on what the test browser offers.
const cryptoApi = webcrypto
const user = {
  id: 'u1',
  username: 'Owner',
  displayName: 'Shop Owner',
  role: 'admin',
}
const T0 = Date.parse('2026-11-19T10:00:00.000Z')
const DAY = 86_400_000
const PASSWORD = 'S3cret!pass-2026'
const save = (now = T0) =>
  saveVerifier(user, PASSWORD, { crypto: cryptoApi, now })
const verify = (name, password, now = T0 + 1000) =>
  verifyOffline(name, password, { crypto: cryptoApi, now })

beforeEach(() => localStorage.clear())

test('the right username and password are accepted without the server', async () => {
  await save()

  expect(await verify('owner', PASSWORD)).toEqual({
    ok: true,
    user: {
      id: 'u1',
      username: 'owner',
      displayName: 'Shop Owner',
      role: 'admin',
    },
  })
  expect((await verify('  OWNER ', PASSWORD)).ok).toBe(true)
  expect(hasVerifier()).toBe(true)
})

test('the password is not stored, only a salted hash', async () => {
  await save()

  const stored = localStorage.getItem('clothing-pos-offline-login')
  expect(stored).not.toContain(PASSWORD)
  expect(JSON.parse(stored)).toMatchObject({
    v: 1,
    iterations: 150000,
    username: 'owner',
  })
  expect(JSON.parse(stored).salt.length).toBeGreaterThan(10)
  expect(JSON.parse(stored).hash.length).toBeGreaterThan(20)
})

test('the same password saved twice gets a different salt and hash', async () => {
  await save()
  const first = JSON.parse(localStorage.getItem('clothing-pos-offline-login'))
  await save()
  const second = JSON.parse(localStorage.getItem('clothing-pos-offline-login'))

  expect(second.salt).not.toBe(first.salt)
  expect(second.hash).not.toBe(first.hash)
})

test('a wrong password or a wrong username is refused the same way', async () => {
  await save()

  expect(await verify('owner', 'not-the-password')).toMatchObject({
    ok: false,
    reason: 'wrong',
    triesLeft: 4,
  })
  expect(await verify('someone', PASSWORD)).toMatchObject({
    ok: false,
    reason: 'wrong',
    triesLeft: 3,
  })
})

test('after 5 wrong tries it locks for 5 minutes, even for the right password, and then works again', async () => {
  await save()
  for (let i = 1; i < MAX_OFFLINE_FAILURES; i += 1) {
    expect((await verify('owner', 'nope', T0 + i * 1000)).reason).toBe('wrong')
  }

  const locked = await verify('owner', 'nope', T0 + 6000)
  expect(locked).toMatchObject({
    ok: false,
    reason: 'locked',
    retryInMs: OFFLINE_LOCK_MS,
  })

  const stillLocked = await verify('owner', PASSWORD, T0 + 60_000)
  expect(stillLocked).toMatchObject({ ok: false, reason: 'locked' })
  expect(stillLocked.retryInMs).toBeLessThan(OFFLINE_LOCK_MS)

  expect(
    (await verify('owner', PASSWORD, T0 + 6000 + OFFLINE_LOCK_MS + 1)).ok,
  ).toBe(true)
})

test('a right password starts the count again', async () => {
  await save()
  for (let i = 0; i < 3; i += 1) await verify('owner', 'nope')
  expect((await verify('owner', PASSWORD)).ok).toBe(true)

  for (let i = 0; i < 3; i += 1)
    expect((await verify('owner', 'nope')).reason).toBe('wrong')
})

test('the offline sign-in is good for 30 days after the last sign-in with the server', async () => {
  await save()

  expect((await verify('owner', PASSWORD, T0 + 29 * DAY)).ok).toBe(true)
  expect(await verify('owner', PASSWORD, T0 + 31 * DAY)).toEqual({
    ok: false,
    reason: 'expired',
  })
})

test('a computer that never signed in, or whose saved sign-in was removed or damaged, says so', async () => {
  expect(await verify('owner', PASSWORD)).toEqual({ ok: false, reason: 'none' })
  expect(hasVerifier()).toBe(false)

  await save()
  clearVerifier()
  expect(await verify('owner', PASSWORD)).toEqual({ ok: false, reason: 'none' })

  localStorage.setItem('clothing-pos-offline-login', '{broken')
  expect(await verify('owner', PASSWORD)).toEqual({ ok: false, reason: 'none' })
  localStorage.setItem(
    'clothing-pos-offline-login',
    JSON.stringify({ v: 1, username: 'owner' }),
  )
  expect(await verify('owner', PASSWORD)).toEqual({ ok: false, reason: 'none' })
  localStorage.setItem(
    'clothing-pos-offline-login',
    JSON.stringify({
      v: 1,
      username: 'owner',
      salt: '***',
      hash: '***',
      iterations: 150000,
      savedAt: new Date(T0).toISOString(),
    }),
  )
  expect(await verify('owner', PASSWORD)).toEqual({ ok: false, reason: 'none' })
})

test('a browser without password checking says so, and saving then fails clearly', async () => {
  await save()

  expect(
    await verifyOffline('owner', PASSWORD, { crypto: {}, now: T0 + 1000 }),
  ).toEqual({
    ok: false,
    reason: 'unsupported',
  })
  await expect(
    saveVerifier(user, PASSWORD, { crypto: { getRandomValues: (a) => a } }),
  ).rejects.toThrow('cannot check a password')
})
