import { vi } from 'vitest'
import { ApiError, AuthError, NetworkError, createApiClient } from './apiClient'

const reply = (status, body) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
  }))

test('sends JSON with the login token', async () => {
  const fetchImpl = reply(200, { results: [] })
  const api = createApiClient({
    baseUrl: 'http://x/api',
    getToken: () => 'tok',
    fetchImpl,
  })

  const ops = [{ type: 'product.upsert', data: { id: 'p1' } }]
  expect(await api.push(ops)).toEqual({ results: [] })

  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('http://x/api/sync/push')
  expect(init.method).toBe('POST')
  expect(init.headers.Authorization).toBe('Bearer tok')
  expect(JSON.parse(init.body)).toEqual({ ops })
})

test('login is sent without a token and returns the answer', async () => {
  const fetchImpl = reply(200, { token: 't', user: { username: 'owner' } })
  const api = createApiClient({ baseUrl: 'http://x/api', fetchImpl })

  const result = await api.login('owner', 'secret')

  expect(result.token).toBe('t')
  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('http://x/api/auth/login')
  expect(init.headers.Authorization).toBeUndefined()
  expect(JSON.parse(init.body)).toEqual({
    username: 'owner',
    password: 'secret',
  })
})

test('a server that cannot be reached becomes a NetworkError', async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  const api = createApiClient({ baseUrl: 'http://x/api', fetchImpl })

  await expect(api.status()).rejects.toBeInstanceOf(NetworkError)
})

test('a server that does not answer in time becomes a NetworkError', async () => {
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      )
    })
  const api = createApiClient({
    baseUrl: 'http://x/api',
    fetchImpl,
    timeoutMs: 20,
  })

  await expect(api.status()).rejects.toMatchObject({
    name: 'NetworkError',
    message: expect.stringContaining('did not answer'),
  })
})

test('HTTP 401 becomes an AuthError with the server message', async () => {
  const fetchImpl = reply(401, {
    error: { code: 'UNAUTHORIZED', message: 'Invalid username or password' },
  })
  const api = createApiClient({ baseUrl: 'http://x/api', fetchImpl })

  const error = await api.login('a', 'b').catch((err) => err)
  expect(error).toBeInstanceOf(AuthError)
  expect(error.message).toBe('Invalid username or password')
})

test('other errors keep their status and code, even without a JSON body', async () => {
  const refused = createApiClient({
    baseUrl: 'http://x/api',
    fetchImpl: reply(422, {
      error: { code: 'SALE_NOT_ALLOWED', message: 'Not allowed', details: [1] },
    }),
  })
  await expect(refused.status()).rejects.toMatchObject({
    status: 422,
    code: 'SALE_NOT_ALLOWED',
    message: 'Not allowed',
  })

  const broken = createApiClient({
    baseUrl: 'http://x/api',
    fetchImpl: reply(502, undefined),
  })
  const error = await broken.status().catch((err) => err)
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 502, code: 'HTTP_ERROR' })
})
