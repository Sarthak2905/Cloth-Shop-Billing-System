// Registers the service worker and reports two things:
//   onOfflineReady   the app has been cached for the first time
//   onUpdateReady    a newer version is downloaded and waiting
// It never switches versions on its own. Call applyUpdate() when the user agrees.
export async function registerServiceWorker({
  scriptUrl = `${import.meta.env.BASE_URL}sw.js`,
  onOfflineReady = () => {},
  onUpdateReady = () => {},
  onError = () => {},
  container = globalThis.navigator?.serviceWorker,
} = {}) {
  if (!container) return null

  let registration
  try {
    registration = await container.register(scriptUrl)
  } catch (err) {
    onError(err)
    return null
  }

  // A new version was already downloaded earlier and is waiting.
  if (registration.waiting && container.controller)
    onUpdateReady(registration.waiting)

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return
      if (container.controller) onUpdateReady(worker)
      else onOfflineReady()
    })
  })

  return registration
}

// Tells the waiting version to take over, then reloads once it has.
export function applyUpdate(
  worker,
  {
    container = globalThis.navigator?.serviceWorker,
    reload = () => window.location.reload(),
  } = {},
) {
  let reloaded = false
  container?.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    reload()
  })
  worker.postMessage({ type: 'SKIP_WAITING' })
}
