// How long to wait before the automatic retry, after this many failures in a row:
// 30 seconds, 1 minute, 2 minutes... never more than 15 minutes.
export function backoffMs(attempt) {
  if (attempt <= 0) return 0
  return Math.min(15 * 60 * 1000, 30_000 * 2 ** (attempt - 1))
}
