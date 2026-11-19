// "This computer is open": set when the owner signs in, and kept for 14 days unless they
// press Lock. It is separate from the sync login, so an expired sync login never locks the
// app in the middle of billing. It is checked when the app opens, not while it runs.
const KEY = 'clothing-pos-unlock'
const DAY = 86_400_000

export const UNLOCK_DAYS = 14

const store = () => globalThis.localStorage

export function clearUnlock() {
  try {
    store()?.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

export function loadUnlock(now = Date.now()) {
  try {
    const raw = store()?.getItem(KEY)
    if (!raw) return null
    const record = JSON.parse(raw)
    if (!record || typeof record.username !== 'string' || typeof record.until !== 'number') {
      clearUnlock()
      return null
    }
    if (record.until <= now) {
      clearUnlock()
      return null
    }
    return record
  } catch {
    return null
  }
}

export function saveUnlock(user, { now = Date.now(), days = UNLOCK_DAYS } = {}) {
  const record = {
    id: user.id ?? null,
    username: user.username ?? '',
    displayName: user.displayName ?? '',
    role: user.role ?? 'admin',
    until: now + days * DAY,
  }
  try {
    store()?.setItem(KEY, JSON.stringify(record))
  } catch {
    // the app still opens; it will ask again next time
  }
  return record
}