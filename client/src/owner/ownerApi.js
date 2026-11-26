import {
  ApiError,
  AuthError,
  DEFAULT_API_URL,
  NetworkError,
} from '../sync/apiClient'

// The admin login lives only in memory. It is separate from the billing/sync login,
// it is gone when the page is refreshed, and it ends by itself after 15 idle minutes.
export const IDLE_MS = 15 * 60 * 1000

let state = { token: null, user: null }
let timer = null
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

export const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getAdminState = () => state

function arm() {
  clearTimeout(timer)
  if (state.token) timer = setTimeout(adminLogout, IDLE_MS)
}

// Call when the admin does something, so the 15 minutes start again.
export const touch = () => {
  if (state.token) arm()
}

export function adminLogout() {
  clearTimeout(timer)
  state = { token: null, user: null }
  emit()
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function adminLogin(
  username,
  password,
  { fetchImpl = (...a) => fetch(...a) } = {},
) {
  let response
  try {
    response = await fetchImpl(`${DEFAULT_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw new NetworkError(
      'Could not reach the server. Check the internet and try again.',
    )
  }
  const data = await readJson(response)
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'HTTP_ERROR',
      data?.error?.message ??
        (response.status === 401
          ? 'Wrong username or password'
          : `The server returned an error (${response.status})`),
    )
  }
  if (data?.user?.role !== 'admin' || !data?.token) {
    throw new ApiError(403, 'NOT_ADMIN', 'This login is not an admin login')
  }
  state = { token: data.token, user: data.user }
  arm()
  emit()
}

export async function ownerGet(
  path,
  { fetchImpl = (...a) => fetch(...a) } = {},
) {
  if (!state.token) throw new AuthError('Please sign in as admin')

  let response
  try {
    response = await fetchImpl(`${DEFAULT_API_URL}/owner${path}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    })
  } catch {
    throw new NetworkError(
      'Could not reach the server. Check the internet and try again.',
    )
  }
  const data = await readJson(response)
  if (response.ok) {
    touch()
    return data
  }
  if (response.status === 401 || response.status === 403) {
    adminLogout() // the login ended or is not an admin: ask again
    throw new AuthError('Admin login ended. Please sign in again.')
  }
  throw new ApiError(
    response.status,
    data?.error?.code ?? 'HTTP_ERROR',
    data?.error?.message ?? `The server returned an error (${response.status})`,
  )
}

export const fetchOwnerDashboard = () => ownerGet('/dashboard')
