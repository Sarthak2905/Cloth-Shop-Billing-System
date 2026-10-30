import { useCallback, useEffect, useState } from 'react'
import {
  applyUpdate as defaultApply,
  registerServiceWorker as defaultRegister,
} from './serviceWorker'

const HOUR = 60 * 60 * 1000

// Online/offline is only a hint from the browser. Nothing depends on it.
export function useOnlineStatus() {
  const [online, setOnline] = useState(
    () => globalThis.navigator?.onLine ?? true,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}

// Only active in the built app (import.meta.env.PROD), never in `npm run dev`.
export function usePwa({
  register = defaultRegister,
  apply = defaultApply,
  enabled = import.meta.env.PROD,
} = {}) {
  const [offlineReady, setOfflineReady] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let timer = null

    register({
      onOfflineReady: () => setOfflineReady(true),
      onUpdateReady: (worker) => setWaitingWorker(worker),
      onError: (err) =>
        console.error('Service worker registration failed', err),
    }).then((registration) => {
      if (cancelled || !registration) return
      // Check for a new version once an hour while the app stays open.
      timer = setInterval(() => {
        Promise.resolve(registration.update?.()).catch(() => {})
      }, HOUR)
    })

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [register, enabled])

  const updateNow = useCallback(() => {
    if (waitingWorker) apply(waitingWorker)
  }, [waitingWorker, apply])

  return {
    offlineReady,
    dismissOfflineReady: () => setOfflineReady(false),
    updateReady: Boolean(waitingWorker),
    updateNow,
  }
}
