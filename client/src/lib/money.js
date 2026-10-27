// Money rule: store integer paise everywhere. Convert only at the edges
// (when the user types an amount, and when we display one).

export function rupeesToPaise(input) {
  const str = String(input).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid rupee amount: "${input}"`)
  }
  const [rupees, paise = ''] = str.split('.')
  return Number(rupees) * 100 + Number(paise.padEnd(2, '0'))
}

export function paiseToRupees(paise) {
  return (paise / 100).toFixed(2)
}

// For display only. Never use the formatted string for calculations.
export function formatINR(paise) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(paise / 100)
}
