// Sales dated more than 10 minutes in the future are refused by the server, so a
// wrong clock on this device would block them. Warn well before that.
export const CLOCK_WARNING_MS = 2 * 60 * 1000

// skewMs > 0 means this device's clock is AHEAD of the server's.
export async function checkClock(api, now = () => Date.now()) {
  const before = now()
  const { serverTime } = await api.status()
  const after = now()
  const skewMs = Math.round((before + after) / 2 - Date.parse(serverTime))
  return {
    skewMs,
    ok: Math.abs(skewMs) <= CLOCK_WARNING_MS,
    checkedAt: new Date(after).toISOString(),
  }
}
