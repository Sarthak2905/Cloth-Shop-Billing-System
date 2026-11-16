// Fabric sold by the meter is kept as whole CENTIMETRES (2.35 m = 235), so there are
// never any decimal rounding errors. Pieces are plain whole numbers.
export const CM_PER_METER = 100

export const isMeter = (unit) => unit === 'meter'

// How much one scan adds: 1 piece, or 1.00 m (100 cm).
export const stepFor = (unit) => (isMeter(unit) ? CM_PER_METER : 1)

// "2.35", "2", ".5" or "2,35" -> centimetres (235, 200, 50, 235).
// Returns null when it is not a valid length (at most 2 decimals).
export function parseMeters(input) {
  const text = String(input ?? '')
    .trim()
    .replace(',', '.')
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  return Number(whole || '0') * CM_PER_METER + Number(fraction.padEnd(2, '0'))
}

const UNIT_WORDS = {
  m: 'm',
  mtr: 'm',
  mtrs: 'm',
  meter: 'm',
  meters: 'm',
  metre: 'm',
  metres: 'm',
  cm: 'cm',
  cms: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  centimetre: 'cm',
  centimetres: 'cm',
}

// A length typed by a person -> whole centimetres, or null when it is not valid.
// "2.25", "2.25 m", "2,25m" are meters. "80 cm" and "80cm" are centimetres.
// A number without a unit uses `defaultUnit` ('m' or 'cm'). Centimetres must be whole.
export function parseLength(input, defaultUnit = 'm') {
  const match = String(input ?? '')
    .trim()
    .toLowerCase()
    .match(/^([\d.,]+)\s*([a-z]*)$/)
  if (!match) return null
  const [, number, word] = match
  let unit = defaultUnit
  if (word) {
    unit = UNIT_WORDS[word]
    if (!unit) return null
  }
  if (unit === 'cm') return /^\d+$/.test(number) ? Number(number) : null
  return parseMeters(number)
}

// 235 -> "2.35"
export function formatMeters(cm) {
  return (cm / CM_PER_METER).toFixed(2)
}

// What to show for a quantity or a stock number: "3" for pieces, "2.35 m" for meters.
export function formatQuantity(quantity, unit) {
  return isMeter(unit) ? `${formatMeters(quantity)} m` : String(quantity)
}
