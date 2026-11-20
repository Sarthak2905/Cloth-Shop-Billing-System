// Label choices set once in Settings and kept on this computer.
const KEY = 'labelPrefs'
export const DEFAULT_LABEL_PREFS = {
  presetId: '', // empty = the first preset
  customWidth: '50',
  customHeight: '25',
  priceMode: 'mrp', // 'mrp' | 'selling' | 'none'
}

export function loadLabelPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...DEFAULT_LABEL_PREFS, ...saved }
  } catch {
    return { ...DEFAULT_LABEL_PREFS }
  }
}

export function saveLabelPrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // storage blocked: the choice just will not be remembered
  }
}
