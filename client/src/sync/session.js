// The sign-in is kept in localStorage, NOT in the database. That keeps the login
// token out of backup files.
export const SESSION_KEY = 'clothing-pos-session'

const storage = () => globalThis.localStorage

export function loadSession() {
  try {
    const raw = storage()?.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    return session && typeof session.token === 'string' ? session : null
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    storage()?.setItem(SESSION_KEY, JSON.stringify(session))
    return true
  } catch {
    return false
  }
}

export function clearSession() {
  try {
    storage()?.removeItem(SESSION_KEY)
  } catch {
    // nothing to do
  }
}

// Reads the expiry time (in milliseconds) from a login token, or null.
export function tokenExpiry(token) {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const { exp } = JSON.parse(json)
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export function isExpired(session, now = Date.now()) {
  const expiry = tokenExpiry(session?.token ?? '')
  return expiry !== null && expiry <= now
}
