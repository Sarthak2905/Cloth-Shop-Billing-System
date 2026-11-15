import { db } from '../db/db.js'
import { AppError } from '../lib/errors.js'

const PIN_KEY = 'ownerPin'
const LOCK_KEY = 'ownerPinLock'
const ITERATIONS = 100_000
const MAX_TRIES = 5
const LOCK_MINUTES = 5
export const PIN_PATTERN = /^\d{4,6}$/

const toHex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
const fromHex = (hex) =>
  Uint8Array.from(hex.match(/.{2}/g) ?? [], (h) => parseInt(h, 16))

function subtle() {
  const s = globalThis.crypto?.subtle
  if (!s) {
    throw new AppError(
      'PIN_UNAVAILABLE',
      'PIN protection needs a secure connection (https or localhost).',
    )
  }
  return s
}

async function hashPin(pin, saltBytes, iterations) {
  const s = subtle()
  const key = await s.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await s.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    key,
    256,
  )
  return toHex(bits)
}

export async function hasOwnerPin() {
  return Boolean(await db.settings.get(PIN_KEY))
}

// The PIN is never stored: only a salted hash of it. Changing an existing PIN
// needs the current one.
export async function setOwnerPin(newPin, { currentPin } = {}) {
  if (!PIN_PATTERN.test(String(newPin ?? ''))) {
    throw new AppError('VALIDATION_ERROR', 'The PIN must be 4 to 6 digits')
  }
  subtle()
  if (await hasOwnerPin()) await verifyOwnerPin(currentPin ?? '')

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const hash = await hashPin(String(newPin), salt, ITERATIONS)
  await db.settings.put({
    key: PIN_KEY,
    value: {
      salt: toHex(salt),
      hash,
      iterations: ITERATIONS,
      setAt: new Date().toISOString(),
    },
  })
}

// Returns true, or throws PIN_NOT_SET / PIN_WRONG / PIN_LOCKED. `now` can be passed in tests.
export async function verifyOwnerPin(pin, now = Date.now()) {
  const row = await db.settings.get(PIN_KEY)
  if (!row)
    throw new AppError('PIN_NOT_SET', 'Set an owner PIN in Settings first')

  const lockRow = await db.settings.get(LOCK_KEY)
  const lock = lockRow?.value ?? { failed: 0, lockedUntil: 0 }
  if (lock.lockedUntil > now) {
    const minutes = Math.ceil((lock.lockedUntil - now) / 60000)
    throw new AppError(
      'PIN_LOCKED',
      `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    )
  }

  const { salt, hash, iterations } = row.value
  const attempt = await hashPin(String(pin ?? ''), fromHex(salt), iterations)

  if (attempt === hash) {
    if (lock.failed > 0 || lock.lockedUntil) {
      await db.settings.put({
        key: LOCK_KEY,
        value: { failed: 0, lockedUntil: 0 },
      })
    }
    return true
  }

  const failed = lock.failed + 1
  if (failed >= MAX_TRIES) {
    await db.settings.put({
      key: LOCK_KEY,
      value: { failed: 0, lockedUntil: now + LOCK_MINUTES * 60000 },
    })
    throw new AppError(
      'PIN_LOCKED',
      `Wrong PIN. Too many tries: locked for ${LOCK_MINUTES} minutes.`,
    )
  }
  await db.settings.put({ key: LOCK_KEY, value: { failed, lockedUntil: 0 } })
  const left = MAX_TRIES - failed
  throw new AppError(
    'PIN_WRONG',
    `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  )
}
