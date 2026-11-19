// Lets the owner open the app on a computer when the server cannot be reached. After a
// successful sign-in the computer keeps a salted hash of the password (never the password
// itself), and can check a password against it later. It is kept in localStorage, not in the
// database, so it never ends up in a backup file.

const VERIFIER_KEY = 'clothing-pos-offline-login'
const FAILURES_KEY = 'clothing-pos-offline-failures'
const ITERATIONS = 150_000
const DAY = 86_400_000

export const OFFLINE_LOGIN_DAYS = 30
export const MAX_OFFLINE_FAILURES = 5
export const OFFLINE_LOCK_MS = 5 * 60 * 1000

const store = () => globalThis.localStorage

function read(key) {
  try {
    const raw = store()?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    store()?.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function remove(key) {
  try {
    store()?.removeItem(key)
  } catch {
    // nothing to remove
  }
}

const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export async function deriveHash(password, salt, iterations, cryptoApi = globalThis.crypto) {
  const subtle = cryptoApi?.subtle
  if (!subtle) throw new Error('This browser cannot check a password without the server')
  const key = await subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i]
  return difference === 0
}

// The saved record, or null when there is none or it is damaged.
function readRecord() {
  const record = read(VERIFIER_KEY)
  if (
    !record ||
    record.v !== 1 ||
    typeof record.username !== 'string' ||
    typeof record.salt !== 'string' ||
    typeof record.hash !== 'string' ||
    !Number.isInteger(record.iterations) ||
    record.iterations < 1000 ||
    record.iterations > 1_000_000 ||
    Number.isNaN(Date.parse(record.savedAt))
  ) {
    return null
  }
  try {
    return { ...record, saltBytes: fromBase64(record.salt), hashBytes: fromBase64(record.hash) }
  } catch {
    return null
  }
}

export const hasVerifier = () => readRecord() !== null

export function clearVerifier() {
  remove(VERIFIER_KEY)
  remove(FAILURES_KEY)
}

// Call after a successful sign-in with the server. Returns false when it could not be kept.
export async function saveVerifier(
  user,
  password,
  { now = Date.now(), crypto: cryptoApi = globalThis.crypto } = {},
) {
  const salt = cryptoApi.getRandomValues(new Uint8Array(16))
  const hash = await deriveHash(password, salt, ITERATIONS, cryptoApi)
  const saved = write(VERIFIER_KEY, {
    v: 1,
    id: user.id ?? null,
    username: String(user.username ?? '').trim().toLowerCase(),
    displayName: user.displayName ?? '',
    role: user.role ?? 'admin',
    salt: toBase64(salt),
    iterations: ITERATIONS,
    hash: toBase64(hash),
    savedAt: new Date(now).toISOString(),
  })
  remove(FAILURES_KEY)
  return saved
}

// Checks a username and password without the server.
// -> { ok: true, user } or { ok: false, reason, ... }
//    reason: 'none' (never signed in here) | 'expired' | 'wrong' | 'locked' | 'unsupported'
export async function verifyOffline(
  username,
  password,
  { now = Date.now(), crypto: cryptoApi = globalThis.crypto } = {},
) {
  const failures = read(FAILURES_KEY) ?? { count: 0, lockedUntil: 0 }
  if (failures.lockedUntil > now) {
    return { ok: false, reason: 'locked', retryInMs: failures.lockedUntil - now }
  }

  const record = readRecord()
  if (!record) return { ok: false, reason: 'none' }
  if (now - Date.parse(record.savedAt) > OFFLINE_LOGIN_DAYS * DAY) {
    return { ok: false, reason: 'expired' }
  }

  let matches = false
  try {
    const hash = await deriveHash(password, record.saltBytes, record.iterations, cryptoApi)
    matches =
      sameBytes(hash, record.hashBytes) &&
      String(username ?? '').trim().toLowerCase() === record.username
  } catch {
    return { ok: false, reason: 'unsupported' }
  }

  if (!matches) {
    const count = (failures.count ?? 0) + 1
    if (count >= MAX_OFFLINE_FAILURES) {
      write(FAILURES_KEY, { count: 0, lockedUntil: now + OFFLINE_LOCK_MS })
      return { ok: false, reason: 'locked', retryInMs: OFFLINE_LOCK_MS }
    }
    write(FAILURES_KEY, { count, lockedUntil: 0 })
    return { ok: false, reason: 'wrong', triesLeft: MAX_OFFLINE_FAILURES - count }
  }

  remove(FAILURES_KEY)
  return {
    ok: true,
    user: {
      id: record.id,
      username: record.username,
      displayName: record.displayName,
      role: record.role,
    },
  }
}