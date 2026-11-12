export class NetworkError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
  }
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api'

// A small wrapper around fetch. It turns every failure into one of three kinds:
//   NetworkError  the server could not be reached (or did not answer in time)
//   AuthError     the login is missing, wrong or expired (HTTP 401)
//   ApiError      the server answered with another error
export function createApiClient({
  baseUrl = DEFAULT_API_URL,
  getToken = () => null,
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = 20000,
} = {}) {
  async function request(method, path, body) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const timedOut = () => new NetworkError('The server did not answer in time')

    try {
      const token = getToken()
      let response
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        })
      } catch (err) {
        throw err?.name === 'AbortError'
          ? timedOut()
          : new NetworkError('Could not reach the server')
      }

      let data = null
      try {
        data = await response.json()
      } catch {
        data = null
      }
      if (controller.signal.aborted) throw timedOut()

      if (response.ok) return data
      if (response.status === 401) {
        throw new AuthError(data?.error?.message ?? 'Please sign in again')
      }
      throw new ApiError(
        response.status,
        data?.error?.code ?? 'HTTP_ERROR',
        data?.error?.message ??
          `The server returned an error (${response.status})`,
        data?.error?.details,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    baseUrl,
    login: (username, password) =>
      request('POST', '/auth/login', { username, password }),
    push: (ops) => request('POST', '/sync/push', { ops }),
    status: () => request('GET', '/sync/status'),
    stockLevels: () => request('GET', '/sync/stock-levels'),
  }
}
