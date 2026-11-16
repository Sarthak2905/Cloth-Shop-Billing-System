import { parseLength } from './quantity.js'

// A signed length for a stock correction: "-2.5" -> -250 cm, "+10" -> 1000, "-80 cm" -> -80.
// Returns null when it is not a valid length (at most 2 decimals in meters).
export function parseSignedMeters(input) {
  const text = String(input ?? '').trim()
  const negative = text.startsWith('-')
  const cm = parseLength(text.replace(/^[+-]\s*/, ''), 'm')
  if (cm === null) return null
  if (cm === 0) return 0
  return negative ? -cm : cm
}
