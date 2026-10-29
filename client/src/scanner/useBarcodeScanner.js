import { useEffect, useRef } from 'react'

function isEditable(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

// Detects keyboard-style scanners: characters arrive very fast, then Enter.
// Slow human typing is ignored. Keys typed inside input fields are ignored too,
// because those fields handle their own Enter.
export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxGapMs = 80,
  minLength = 4,
}) {
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return undefined

    let buffer = ''
    let lastTime = 0

    function handleKeyDown(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (isEditable(e.target)) return

      const now = performance.now()
      if (now - lastTime > maxGapMs) buffer = ''
      lastTime = now

      if (e.key === 'Enter') {
        if (buffer.length >= minLength) {
          // Stops Enter from "clicking" a focused button.
          e.preventDefault()
          onScanRef.current(buffer)
        }
        buffer = ''
        return
      }
      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, maxGapMs, minLength])
}
