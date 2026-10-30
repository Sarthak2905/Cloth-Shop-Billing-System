// EAN-13 check digit: weights 1,3,1,3... over the first 12 digits.
export function eanCheckDigit(first12Digits) {
  if (!/^\d{12}$/.test(first12Digits)) {
    throw new Error('An EAN-13 check digit needs exactly 12 digits')
  }
  let sum = 0
  for (let i = 0; i < 12; i += 1) {
    sum += Number(first12Digits[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code) {
  return (
    /^\d{13}$/.test(code) &&
    eanCheckDigit(code.slice(0, 12)) === Number(code[12])
  )
}

// We only use two barcode types:
//   - EAN-13, but only for a 13-digit number with a correct check digit
//   - Code 128 for everything else (including your own CLO000001 codes)
export function chooseSymbology(barcode) {
  if (/^\d{13}$/.test(barcode)) {
    if (isValidEan13(barcode)) return { symbology: 'ean13', warning: null }
    return {
      symbology: 'code128',
      warning:
        'Looks like an EAN-13 but the check digit is wrong, so it is printed as Code 128.',
    }
  }
  return { symbology: 'code128', warning: null }
}
