import { inRange, rangeFor, summarizeSales } from './salesFilter'

const now = new Date(2026, 10, 25, 14, 0) // 25 Nov 2026, 2 pm
const at = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString()

test('today covers the whole of today and nothing else', () => {
  const range = rangeFor('today', '', '', now)
  expect(inRange({ createdAt: at(2026, 10, 25, 0) }, range)).toBe(true)
  expect(inRange({ createdAt: at(2026, 10, 25, 23) }, range)).toBe(true)
  expect(inRange({ createdAt: at(2026, 10, 24, 23) }, range)).toBe(false)
  expect(inRange({ createdAt: at(2026, 10, 26, 1) }, range)).toBe(false)
})

test('yesterday', () => {
  const range = rangeFor('yesterday', '', '', now)
  expect(inRange({ createdAt: at(2026, 10, 24) }, range)).toBe(true)
  expect(inRange({ createdAt: at(2026, 10, 25) }, range)).toBe(false)
})

test('last 7 days includes today and the 6 days before it', () => {
  const range = rangeFor('week', '', '', now)
  expect(inRange({ createdAt: at(2026, 10, 19) }, range)).toBe(true)
  expect(inRange({ createdAt: at(2026, 10, 18) }, range)).toBe(false)
})

test('this month starts on the 1st', () => {
  const range = rangeFor('month', '', '', now)
  expect(inRange({ createdAt: at(2026, 10, 1, 0) }, range)).toBe(true)
  expect(inRange({ createdAt: at(2026, 9, 31) }, range)).toBe(false)
})

test('chosen dates include both the first and the last day', () => {
  const range = rangeFor('custom', '2026-11-10', '2026-11-12')
  expect(inRange({ createdAt: at(2026, 10, 10, 0) }, range)).toBe(true)
  expect(inRange({ createdAt: at(2026, 10, 12, 23) }, range)).toBe(true)
  expect(inRange({ createdAt: at(2026, 10, 9, 23) }, range)).toBe(false)
  expect(inRange({ createdAt: at(2026, 10, 13, 0) }, range)).toBe(false)
})

test('only one chosen date works as "from" or "until", and none means all dates', () => {
  expect(
    inRange(
      { createdAt: at(2030, 0, 1) },
      rangeFor('custom', '2026-11-10', ''),
    ),
  ).toBe(true)
  expect(
    inRange(
      { createdAt: at(2020, 0, 1) },
      rangeFor('custom', '', '2026-11-10'),
    ),
  ).toBe(true)
  expect(rangeFor('custom', '', '')).toBeNull()
  expect(rangeFor('all')).toBeNull()
  expect(inRange({ createdAt: 'x' }, null)).toBe(true)
})

test('the total skips cancelled bills and counts the pending ones', () => {
  const sales = [
    { totalPaise: 10000, paymentStatus: 'paid' },
    { totalPaise: 5000, paymentStatus: 'pending' },
    { totalPaise: 9999, status: 'cancelled', paymentStatus: 'paid' },
  ]
  expect(summarizeSales(sales)).toEqual({
    count: 2,
    totalPaise: 15000,
    pendingPaise: 5000,
  })
})
