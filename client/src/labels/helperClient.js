export class HelperError extends Error {
  constructor(message, kind) {
    super(message)
    this.name = 'HelperError'
    this.kind = kind // 'unreachable' | 'refused'
  }
}

const TIMEOUT_MS = 20000

async function call(
  baseUrl,
  path,
  {
    method = 'GET',
    body,
    headers,
    fetchImpl = (...args) => fetch(...args),
    timeoutMs = TIMEOUT_MS,
  } = {},
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(
      `${String(baseUrl).replace(/\/+$/, '')}${path}`,
      {
        method,
        body,
        headers,
        signal: controller.signal,
        // the helper runs on this computer: Chrome asks once for permission to reach it
        targetAddressSpace: 'loopback',
      },
    )
  } catch (err) {
    throw new HelperError(
      err?.name === 'AbortError'
        ? 'The label helper did not answer in time'
        : 'The label helper is not running on this computer, or the browser did not allow the connection',
      'unreachable',
    )
  } finally {
    clearTimeout(timer)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok || data?.ok === false) {
    throw new HelperError(
      data?.error ?? `The label helper returned an error (${response.status})`,
      'refused',
    )
  }
  return data
}

export const checkHelper = (url, options) => call(url, '/health', options)
export const listPrinters = (url, options) => call(url, '/printers', options)

export function sendToHelper(
  url,
  bytes,
  { printerName = '', ...options } = {},
) {
  const query = printerName ? `?printer=${encodeURIComponent(printerName)}` : ''
  return call(url, `/print${query}`, {
    method: 'POST',
    body: bytes,
    headers: { 'Content-Type': 'application/octet-stream' },
    ...options,
  })
}
