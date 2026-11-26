// Money is stored as integer paise. These helpers only change how it is shown.
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export const rupees = (paise) => inr.format(Math.round((paise ?? 0) / 100))

// Compares two amounts: { text: '+12%', up: true } or null if there is nothing to compare.
export function change(now, before) {
  if (!before) return null
  const pct = Math.round(((now - before) / before) * 100)
  return { text: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 }
}

// '2026-11-25' -> 'Wed'
export function dayName(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    timeZone: 'UTC',
  })
}
