import { useEffect, useRef } from 'react'

const TEXT_TYPES = ['', 'text', 'search', 'tel', 'number', 'email', 'url']

// A text box the scanner may type into by mistake. The barcode box itself (marked
// data-scan-self) handles its own scans, so it is skipped.
function isTextField(el) {
  if (!(el instanceof HTMLElement)) return false
  if (el.dataset.scanSelf !== undefined) return false
  if (el.tagName === 'TEXTAREA') return true
  return (
    el.tagName === 'INPUT' &&
    TEXT_TYPES.includes((el.getAttribute('type') || '').toLowerCase())
  )
}

// Scanner characters arrive very fast and end with Enter. When that happens inside a text
// box, the scan is handed to onScan, the Enter is swallowed, and the box gets back the text
// it had before the scan. Human typing is slower and is left alone.
export function useFieldScanner({
  onScan,
  enabled = true,
  maxGapMs = 50,
  minLength = 6,
}) {
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return undefined

    let buffer = ''
    let last = 0
    let field = null
    let before = ''

    function restore() {
      if (!field || !field.isConnected) return
      const proto =
        field.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
      // the native setter + an input event, so React's onChange sees the change too
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, before)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }

    function onKeyDown(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (!isTextField(e.target)) return

      const now = performance.now()
      if (e.target !== field || now - last > maxGapMs) {
        buffer = ''
        field = e.target
        before = e.target.value // the text before this possible scan began
      }
      last = now

      if (e.key === 'Enter') {
        if (buffer.length >= minLength) {
          e.preventDefault()
          e.stopPropagation() // the box's own Enter handling (save, submit) must not run
          const code = buffer
          buffer = ''
          restore()
          onScanRef.current(code)
        } else {
          buffer = ''
        }
        return
      }
      if (e.key.length === 1) buffer += e.key
    }

    // capture phase: runs before the boxes' own handlers
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, maxGapMs, minLength])
}
