import { useEffect, useRef, useState } from 'react'

const KEY = 'theme'

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

export function systemPrefersDark() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true
  )
}

// The saved choice, or else what the computer itself uses.
export function currentTheme() {
  return getStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light')
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // private window: the choice just is not remembered
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme)
  const latest = useRef(theme)

  useEffect(() => {
    latest.current = theme
    applyTheme(theme)
  }, [theme])

  // Paper is always white: while printing, the light colours are used.
  useEffect(() => {
    const before = () => document.documentElement.classList.remove('dark')
    const after = () => applyTheme(latest.current)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    saveTheme(next)
    setTheme(next)
  }

  return { theme, toggle }
}
