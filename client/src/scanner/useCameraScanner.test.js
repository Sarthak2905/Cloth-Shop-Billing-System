import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { describeCameraError, useCameraScanner } from './useCameraScanner'

function makeVideo() {
  const video = document.createElement('video')
  video.play = vi.fn().mockResolvedValue(undefined)
  return video
}

function setMediaDevices(value) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value,
    configurable: true,
  })
}

afterEach(() => {
  setMediaDevices(undefined)
})

test('describeCameraError gives a readable message for common failures', () => {
  expect(describeCameraError({ name: 'NotAllowedError' })).toContain(
    'permission',
  )
  expect(describeCameraError({ name: 'NotFoundError' })).toContain('No camera')
  expect(describeCameraError({ name: 'NotReadableError' })).toContain(
    'another app',
  )
  expect(describeCameraError({ name: 'UnsupportedError' })).toContain('HTTPS')
  expect(describeCameraError(new Error('boom'))).toContain('boom')
})

test('does not open the camera while inactive', () => {
  const getUserMedia = vi.fn()
  setMediaDevices({ getUserMedia })
  const videoRef = { current: makeVideo() }
  const { result } = renderHook(() =>
    useCameraScanner({ videoRef, active: false, onScan: vi.fn() }),
  )
  expect(result.current.status).toBe('idle')
  expect(getUserMedia).not.toHaveBeenCalled()
})

test('explains when the browser has no camera API', async () => {
  setMediaDevices(undefined)
  const videoRef = { current: makeVideo() }
  const { result } = renderHook(() =>
    useCameraScanner({ videoRef, active: true, onScan: vi.fn() }),
  )
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error).toContain('HTTPS')
})

test('explains when camera permission is denied', async () => {
  const getUserMedia = vi.fn().mockRejectedValue({ name: 'NotAllowedError' })
  setMediaDevices({ getUserMedia })
  const videoRef = { current: makeVideo() }
  const { result } = renderHook(() =>
    useCameraScanner({ videoRef, active: true, onScan: vi.fn() }),
  )
  await waitFor(() => expect(result.current.status).toBe('error'))
  expect(result.current.error).toContain('permission')
})

test('reports a visible barcode once and stops the camera on unmount', async () => {
  const track = { stop: vi.fn() }
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] })
  setMediaDevices({ getUserMedia })

  const detector = {
    detect: vi.fn().mockResolvedValue([{ rawValue: 'CLO000001' }]),
  }
  const createDetector = async () => detector
  const grabFrame = () => ({ fake: 'frame' })
  const onScan = vi.fn()
  const videoRef = { current: makeVideo() }

  const { result, unmount } = renderHook(() =>
    useCameraScanner({
      videoRef,
      active: true,
      onScan,
      intervalMs: 10,
      cooldownMs: 1000,
      createDetector,
      grabFrame,
    }),
  )

  await waitFor(() => expect(result.current.status).toBe('scanning'))
  await waitFor(() => expect(onScan).toHaveBeenCalledWith('CLO000001'))

  // The same code stays in view, so it must not be reported again.
  await new Promise((resolve) => setTimeout(resolve, 80))
  expect(onScan).toHaveBeenCalledTimes(1)
  expect(detector.detect.mock.calls.length).toBeGreaterThan(1)

  unmount()
  expect(track.stop).toHaveBeenCalled()
})
