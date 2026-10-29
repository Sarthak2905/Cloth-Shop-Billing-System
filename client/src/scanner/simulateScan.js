// Fires the same keydown events a hardware keyboard-style scanner would:
// every character, then Enter, all at once (no human-speed gaps).
export function simulateKeyboardScan(code, target = document.body) {
  for (const ch of code) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: ch, bubbles: true }),
    )
  }
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  )
}
