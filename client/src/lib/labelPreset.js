// Carries "print these labels" from the Add stock screen to the Labels page.
const KEY = 'labelPreset'
const MAX_AGE_MS = 2 * 60 * 1000

export function setLabelPreset(copies) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), copies }))
  } catch {
    // storage can be blocked (private window): then the labels are simply not pre-filled
  }
}

// { variantId: copies }, each limited to 1-99. Empty when old or missing.
export function readLabelPreset() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return {}
    const { at, copies } = JSON.parse(raw)
    if (!copies || Date.now() - at > MAX_AGE_MS) return {}
    const result = {}
    for (const [id, n] of Object.entries(copies)) {
      const count = Math.max(0, Math.min(99, Math.floor(Number(n)) || 0))
      if (count) result[id] = count
    }
    return result
  } catch {
    return {}
  }
}

export function clearLabelPreset() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}
