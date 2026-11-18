// Settings of direct label printing. They are kept in this browser (localStorage).
const KEY = 'labelPrinterSettings'

export const DEFAULT_PRINTER_SETTINGS = {
  direct: false, // false = the browser's print window, as before
  helperUrl: 'http://127.0.0.1:9101',
  printerName: '', // empty = the printer the helper was started with
  gapMm: 3,
  density: 8,
  upsideDown: false,
  offsetXmm: 0,
  offsetYmm: 0,
}

const blank = (value) => value === undefined || value === null || value === ''

function number(value, low, high, fallback) {
  if (blank(value)) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback
}

export function normalizePrinterSettings(raw = {}) {
  const d = DEFAULT_PRINTER_SETTINGS
  const url = typeof raw?.helperUrl === 'string' ? raw.helperUrl.trim() : ''
  return {
    direct: raw?.direct === true,
    helperUrl: url || d.helperUrl,
    printerName:
      typeof raw?.printerName === 'string'
        ? raw.printerName.trim().slice(0, 120)
        : '',
    gapMm: number(raw?.gapMm, 0, 20, d.gapMm),
    density: Math.round(number(raw?.density, 0, 15, d.density)),
    upsideDown: raw?.upsideDown === true,
    offsetXmm: number(raw?.offsetXmm, 0, 20, 0),
    offsetYmm: number(raw?.offsetYmm, 0, 20, 0),
  }
}

export function loadPrinterSettings() {
  try {
    return normalizePrinterSettings(
      JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {},
    )
  } catch {
    return normalizePrinterSettings({})
  }
}

export function savePrinterSettings(settings) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(normalizePrinterSettings(settings)),
    )
  } catch {
    // storage blocked or full: the settings are simply not kept
  }
}

// What the print job needs from the settings.
export function tsplOptions(settings) {
  const s = normalizePrinterSettings(settings)
  return {
    gapMm: s.gapMm,
    density: s.density,
    direction: s.upsideDown ? 0 : 1,
    offsetXmm: s.offsetXmm,
    offsetYmm: s.offsetYmm,
  }
}
