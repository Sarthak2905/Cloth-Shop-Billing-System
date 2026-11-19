import { vi } from 'vitest'
import { createApiClient } from './apiClient'

const reply = (body) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))

test('a page is asked for by kind, with the place to continue from and a size', async () => {
  const fetchImpl = reply({ items: [], cursor: null, hasMore: false })
  const api = createApiClient({
    baseUrl: 'http://x/api',
    getToken: () => 'tok',
    fetchImpl,
  })

  await api.pullPage('sales', {
    after: '2026-11-19T10:00:00.000Z|!',
    limit: 25,
  })

  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe(
    'http://x/api/sync/pull/sales?after=2026-11-19T10%3A00%3A00.000Z%7C%21&limit=25',
  )
  expect(init.method).toBe('GET')
  expect(init.headers.Authorization).toBe('Bearer tok')
})

test('the first page needs no place to continue from', async () => {
  const fetchImpl = reply({ items: [] })
  const api = createApiClient({ baseUrl: 'http://x/api', fetchImpl })

  await api.pullPage('products')

  expect(fetchImpl.mock.calls[0][0]).toBe('http://x/api/sync/pull/products')
})

test('the summary is a plain GET', async () => {
  const fetchImpl = reply({ counts: { products: 1 } })
  const api = createApiClient({ baseUrl: 'http://x/api', fetchImpl })

  expect(await api.pullSummary()).toEqual({ counts: { products: 1 } })
  expect(fetchImpl.mock.calls[0][0]).toBe('http://x/api/sync/pull-summary')
})
