import { rupeesToPaise } from './money.js'

export const isBlankInput = (value) => String(value ?? '').trim() === ''

// "599", "599.50", "₹1,299" -> paise. Returns null when it is not a valid amount.
export function parseMoneyInput(text) {
  const cleaned = String(text ?? '').replace(/₹|,|\s/g, '')
  try {
    return rupeesToPaise(cleaned)
  } catch {
    return null
  }
}

// "12" -> 12. Returns null unless it is a whole number from 0 to 1,000,000.
export function parseWholeInput(text) {
  const value = String(text ?? '').trim()
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return n <= 1_000_000 ? n : null
}
