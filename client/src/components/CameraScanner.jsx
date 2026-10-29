import { useRef } from 'react'
import { useCameraScanner } from '../scanner/useCameraScanner'

export default function CameraScanner({ active, onScan }) {
    const videoRef = useRef(null)
    const { status, error } = useCameraScanner({ videoRef, active, onScan })

    if (!active) return null

    return (
        <div className="space-y-2">
            <video
                ref={videoRef}
                playsInline
                muted
                aria-label="Camera preview"
                className="w-full rounded-xl bg-black"
            />
            {status === 'starting' && <p className="text-sm text-slate-500">Starting camera...</p>}
            {status === 'scanning' && (
                <p className="text-sm text-slate-600">Point the camera at a barcode.</p>
            )}
            {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
        </div>
    )
}