import { vi } from 'vitest'
import {
  HelperError,
  checkHelper,
  listPrinters,
  sendToHelper,
} from './helperClient'

const reply = (status, body) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
  }))

test('a label job is posted as raw bytes, naming the printer when one is set', async () => {
  const fetchImpl = reply(200, { ok: true, bytes: 4 })
  const bytes = new Uint8Array([1, 2, 3, 4])

  const result = await sendToHelper('http://127.0.0.1:9101/', bytes, {
    printerName: 'TSC TTP-244 Pro',
    fetchImpl,
  })

  expect(result).toEqual({ ok: true, bytes: 4 })
  const [url, init] = fetchImpl.mock.calls[0]
  expect(url).toBe('http://127.0.0.1:9101/print?printer=TSC%20TTP-244%20Pro')
  expect(init).toMatchObject({
    method: 'POST',
    body: bytes,
    targetAddressSpace: 'loopback',
  })
  expect(init.headers['Content-Type']).toBe('application/octet-stream')
})

test('without a printer name the helper uses its own printer', async () => {
  const fetchImpl = reply(200, { ok: true })

  await sendToHelper('http://127.0.0.1:9101', new Uint8Array([1]), {
    fetchImpl,
  })

  expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:9101/print')
})

test('the connection check and the printer list are plain GET calls', async () => {
  const health = reply(200, { ok: true, printer: 'TSC TTP-244 Pro' })
  expect(
    await checkHelper('http://127.0.0.1:9101', { fetchImpl: health }),
  ).toMatchObject({
    printer: 'TSC TTP-244 Pro',
  })
  expect(health.mock.calls[0][0]).toBe('http://127.0.0.1:9101/health')
  expect(health.mock.calls[0][1].method).toBe('GET')

  const printers = reply(200, { ok: true, printers: ['A', 'B'] })
  expect(
    (await listPrinters('http://127.0.0.1:9101', { fetchImpl: printers }))
      .printers,
  ).toEqual(['A', 'B'])
  expect(printers.mock.calls[0][0]).toBe('http://127.0.0.1:9101/printers')
})

test('a helper that is not running gives a clear message', async () => {
  const fetchImpl = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })

  const error = await sendToHelper(
    'http://127.0.0.1:9101',
    new Uint8Array([1]),
    { fetchImpl },
  ).catch((e) => e)

  expect(error).toBeInstanceOf(HelperError)
  expect(error.kind).toBe('unreachable')
  expect(error.message).toContain('not running')
})

test('a helper that does not answer in time gives its own message', async () => {
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      )
    })

  await expect(
    checkHelper('http://127.0.0.1:9101', { fetchImpl, timeoutMs: 20 }),
  ).rejects.toMatchObject({
    kind: 'unreachable',
    message: expect.stringContaining('did not answer'),
  })
})

test('a refusal from the helper keeps its reason, and a reply without a body still says the status', async () => {
  const refused = reply(500, {
    ok: false,
    error: "The printer 'X' was not found",
  })
  await expect(
    sendToHelper('http://127.0.0.1:9101', new Uint8Array([1]), {
      fetchImpl: refused,
    }),
  ).rejects.toMatchObject({
    kind: 'refused',
    message: "The printer 'X' was not found",
  })

  const noBody = reply(403, undefined)
  await expect(
    checkHelper('http://127.0.0.1:9101', { fetchImpl: noBody }),
  ).rejects.toMatchObject({
    kind: 'refused',
    message: expect.stringContaining('403'),
  })

  const okFalse = reply(200, { ok: false, error: 'Not now' })
  await expect(
    checkHelper('http://127.0.0.1:9101', { fetchImpl: okFalse }),
  ).rejects.toMatchObject({
    message: 'Not now',
  })
})
