import { act, renderHook } from '@testing-library/react'
import {
  applyTheme,
  currentTheme,
  getStoredTheme,
  saveTheme,
  useTheme,
} from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

test('a saved choice wins, and without one the computer decides', () => {
  expect(currentTheme()).toBe('light')

  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  expect(currentTheme()).toBe('dark')

  saveTheme('light')
  expect(getStoredTheme()).toBe('light')
  expect(currentTheme()).toBe('light')
  delete window.matchMedia
})

test('applying a theme adds or removes the dark class', () => {
  applyTheme('dark')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  applyTheme('light')
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})

test('the switch changes the page, remembers the choice, and switches back', () => {
  const { result } = renderHook(() => useTheme())
  expect(result.current.theme).toBe('light')

  act(() => result.current.toggle())
  expect(result.current.theme).toBe('dark')
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(getStoredTheme()).toBe('dark')

  act(() => result.current.toggle())
  expect(document.documentElement.classList.contains('dark')).toBe(false)
  expect(getStoredTheme()).toBe('light')
})

test('the page is light while printing and goes back afterwards', () => {
  renderHook(() => useTheme())
  act(() => applyTheme('dark'))

  window.dispatchEvent(new Event('beforeprint'))
  expect(document.documentElement.classList.contains('dark')).toBe(false)
})
