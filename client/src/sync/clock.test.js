import { vi } from 'vitest'
import { checkClock } from './clock'

const SERVER = Date.parse('2026-11-05T10:00:00.000Z')

function check(deviceOffsetMs) {
  const device = SERVER + deviceOffsetMs
  const now = vi.fn().mockReturnValueOnce(device).mockReturnValueOnce(device)
  const api = {
    status: async () => ({ serverTime: new Date(SERVER).toISOString() }),
  }
  return checkClock(api, now)
}

test('a clock that matches the server is fine', async () => {
  const result = await check(30_000)
  expect(result.ok).toBe(true)
  expect(result.skewMs).toBe(30_000)
})

test('a clock that is minutes ahead or behind is flagged, and the direction is kept', async () => {
  const ahead = await check(5 * 60_000)
  expect(ahead.ok).toBe(false)
  expect(ahead.skewMs).toBe(5 * 60_000)

  const behind = await check(-7 * 60_000)
  expect(behind.ok).toBe(false)
  expect(behind.skewMs).toBe(-7 * 60_000)
})
