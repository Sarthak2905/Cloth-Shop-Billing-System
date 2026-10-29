import { renderHook, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { useBarcodeScanner } from './useBarcodeScanner'

let clock = 0

beforeEach(() => {
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function press(key, gap, target = document.body) {
  clock += gap
  fireEvent.keyDown(target, { key })
}

function typeCode(code, gap, target) {
  for (const ch of code) press(ch, gap, target)
}

test('detects a fast keyboard-style scan ending with Enter', () => {
  const onScan = vi.fn()
  renderHook(() => useBarcodeScanner({ onScan }))
  typeCode('CLO000001', 10)
  press('Enter', 10)
  expect(onScan).toHaveBeenCalledTimes(1)
  expect(onScan).toHaveBeenCalledWith('CLO000001')
})

test('ignores slow human typing', () => {
  const onScan = vi.fn()
  renderHook(() => useBarcodeScanner({ onScan }))
  typeCode('CLO000001', 200)
  press('Enter', 200)
  expect(onScan).not.toHaveBeenCalled()
})

test('ignores very short input', () => {
  const onScan = vi.fn()
  renderHook(() => useBarcodeScanner({ onScan }))
  typeCode('AB', 10)
  press('Enter', 10)
  expect(onScan).not.toHaveBeenCalled()
})

test('ignores keys typed inside an input field', () => {
  const onScan = vi.fn()
  renderHook(() => useBarcodeScanner({ onScan }))
  const input = document.createElement('input')
  document.body.appendChild(input)
  typeCode('CLO000001', 10, input)
  press('Enter', 10, input)
  document.body.removeChild(input)
  expect(onScan).not.toHaveBeenCalled()
})

test('does nothing when disabled', () => {
  const onScan = vi.fn()
  renderHook(() => useBarcodeScanner({ onScan, enabled: false }))
  typeCode('CLO000001', 10)
  press('Enter', 10)
  expect(onScan).not.toHaveBeenCalled()
})

test('stops listening after unmount', () => {
  const onScan = vi.fn()
  const { unmount } = renderHook(() => useBarcodeScanner({ onScan }))
  unmount()
  typeCode('CLO000001', 10)
  press('Enter', 10)
  expect(onScan).not.toHaveBeenCalled()
})
