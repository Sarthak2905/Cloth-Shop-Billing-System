import { vi } from 'vitest'
import { applyUpdate, registerServiceWorker } from './serviceWorker'

function makeBrowser({ controller = null } = {}) {
  const container = new EventTarget()
  container.controller = controller

  const registration = new EventTarget()
  registration.waiting = null
  registration.installing = null
  registration.update = vi.fn()

  container.register = vi.fn().mockResolvedValue(registration)
  return { container, registration }
}

function makeWorker(state = 'installing') {
  const worker = new EventTarget()
  worker.state = state
  worker.postMessage = vi.fn()
  return worker
}

function installWorker(registration, worker) {
  registration.installing = worker
  registration.dispatchEvent(new Event('updatefound'))
  worker.state = 'installed'
  worker.dispatchEvent(new Event('statechange'))
}

test('reports "offline ready" when the very first version is installed', async () => {
  const { container, registration } = makeBrowser({ controller: null })
  const onOfflineReady = vi.fn()
  const onUpdateReady = vi.fn()
  await registerServiceWorker({ container, onOfflineReady, onUpdateReady })

  installWorker(registration, makeWorker())

  expect(onOfflineReady).toHaveBeenCalledTimes(1)
  expect(onUpdateReady).not.toHaveBeenCalled()
})

test('reports an update when a new version installs while the app is already controlled', async () => {
  const { container, registration } = makeBrowser({ controller: {} })
  const onOfflineReady = vi.fn()
  const onUpdateReady = vi.fn()
  await registerServiceWorker({ container, onOfflineReady, onUpdateReady })

  const worker = makeWorker()
  installWorker(registration, worker)

  expect(onUpdateReady).toHaveBeenCalledWith(worker)
  expect(onOfflineReady).not.toHaveBeenCalled()
})

test('reports an update that was already waiting when the app started', async () => {
  const { container, registration } = makeBrowser({ controller: {} })
  const waiting = makeWorker('installed')
  registration.waiting = waiting
  const onUpdateReady = vi.fn()

  await registerServiceWorker({ container, onUpdateReady })

  expect(onUpdateReady).toHaveBeenCalledWith(waiting)
})

test('does nothing when the browser has no service worker support', async () => {
  const result = await registerServiceWorker({ container: null })
  expect(result).toBeNull()
})

test('applyUpdate asks the new version to take over and reloads only once', () => {
  const { container } = makeBrowser({ controller: {} })
  const worker = makeWorker('installed')
  const reload = vi.fn()

  applyUpdate(worker, { container, reload })

  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  expect(reload).not.toHaveBeenCalled()

  container.dispatchEvent(new Event('controllerchange'))
  container.dispatchEvent(new Event('controllerchange'))
  expect(reload).toHaveBeenCalledTimes(1)
})
