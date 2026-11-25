const DAY_MS = 24 * 60 * 60 * 1000

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const endOfDay = (date) => startOfDay(date) + DAY_MS - 1

// "2026-11-25" from a date box -> the start / end of that day on this computer's clock.
function parseDay(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''))
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export const DATE_CHOICES = [
  ['all', 'All dates'],
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
  ['month', 'This month'],
  ['custom', 'Choose dates'],
]

// { start, end } in milliseconds (either may be infinite), or null for "all dates".
export function rangeFor(kind, from = '', to = '', now = new Date()) {
  if (kind === 'today') return { start: startOfDay(now), end: endOfDay(now) }
  if (kind === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    return { start: startOfDay(y), end: endOfDay(y) }
  }
  if (kind === 'week') {
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    return { start: startOfDay(first), end: endOfDay(now) }
  }
  if (kind === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: startOfDay(first), end: endOfDay(now) }
  }
  if (kind === 'custom') {
    const a = parseDay(from)
    const b = parseDay(to)
    if (!a && !b) return null
    return {
      start: a ? startOfDay(a) : -Infinity,
      end: b ? endOfDay(b) : Infinity,
    }
  }
  return null
}

export function inRange(sale, range) {
  if (!range) return true
  const time = Date.parse(sale.createdAt)
  return Number.isFinite(time) && time >= range.start && time <= range.end
}

// What the bills on screen add up to. Cancelled bills are not counted.
export function summarizeSales(sales) {
  let count = 0
  let totalPaise = 0
  let pendingPaise = 0
  for (const sale of sales) {
    if (sale.status === 'cancelled') continue
    count += 1
    totalPaise += sale.totalPaise
    if (sale.paymentStatus === 'pending') pendingPaise += sale.totalPaise
  }
  return { count, totalPaise, pendingPaise }
}
