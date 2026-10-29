import { useEffect, useRef, useState } from 'react'
import { createDetector as defaultCreateDetector } from './detector'

const IDLE = { status: 'idle', error: '' }

export function describeCameraError(err) {
  switch (err?.name) {
    case 'UnsupportedError':
      return 'This browser cannot open the camera here. Camera scanning needs HTTPS or localhost.'
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in the browser settings and try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.'
    case 'NotReadableError':
      return 'The camera is being used by another app.'
    default:
      return `Could not start the camera: ${err?.message || 'unknown error'}`
  }
}

let frameCanvas = null

// Copies the current video frame into ImageData so the detector can read it.
function defaultGrabFrame(video) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null // camera has no picture yet
  frameCanvas ??= document.createElement('canvas')
  frameCanvas.width = width
  frameCanvas.height = height
  const ctx = frameCanvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

// Opens the camera into a <video> element and reports each barcode it sees.
// A code that stays in view is reported once; it is reported again only after
// it has been out of view for `cooldownMs`.
export function useCameraScanner({
  videoRef,
  active,
  onScan,
  intervalMs = 150,
  cooldownMs = 1500,
  createDetector = defaultCreateDetector,
  grabFrame = defaultGrabFrame,
}) {
  const [state, setState] = useState(IDLE)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!active) return undefined

    let cancelled = false
    let timer = null
    let stream = null
    const video = videoRef.current
    const lastSeen = new Map()

    function scheduleNext(detector) {
      timer = setTimeout(async () => {
        if (cancelled) return
        try {
          const frame = grabFrame(video)
          if (frame) {
            const found = await detector.detect(frame)
            const now = Date.now()
            for (const item of found) {
              const code = item.rawValue
              if (!code) continue
              const last = lastSeen.get(code)
              lastSeen.set(code, now) // seeing it again keeps it "in view"
              if (last === undefined || now - last > cooldownMs) {
                if (!cancelled) onScanRef.current(code)
              }
            }
          }
        } catch {
          // One bad frame is not fatal; try the next one.
        }
        if (!cancelled) scheduleNext(detector)
      }, intervalMs)
    }

    async function start() {
      try {
        if (!video) throw new Error('Camera preview is not ready')
        if (!navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error('unsupported'), {
            name: 'UnsupportedError',
          })
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        await video.play()
        const detector = await createDetector()
        if (cancelled) return
        setState({ status: 'scanning', error: '' })
        scheduleNext(detector)
      } catch (err) {
        if (!cancelled)
          setState({ status: 'error', error: describeCameraError(err) })
      }
    }

    start()

    return () => {
      cancelled = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      if (video) video.srcObject = null
      setState(IDLE)
    }
  }, [active, videoRef, intervalMs, cooldownMs, createDetector, grabFrame])

  if (!active) return IDLE
  return state.status === 'idle' ? { status: 'starting', error: '' } : state
}
