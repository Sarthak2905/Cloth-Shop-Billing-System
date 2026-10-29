import { useCallback, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSellableVariants } from '../db/catalogRepo'
import { lookupBarcode } from '../scanner/scanService'
import { useBarcodeScanner } from '../scanner/useBarcodeScanner'
import { simulateKeyboardScan } from '../scanner/simulateScan'
import ScanResultCard from '../components/ScanResultCard'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'

const SOURCE_LABEL = { manual: 'Typed', keyboard: 'Keyboard scan' }

export default function ScannerTestPage() {
    const [manual, setManual] = useState('')
    const [result, setResult] = useState(null)
    const [log, setLog] = useState([])
    const [selected, setSelected] = useState('')
    const inputRef = useRef(null)
    const nextLogId = useRef(0)

    const items = useLiveQuery(() => listSellableVariants(), [])
    const selectedBarcode = selected || items?.[0]?.variant.barcode || ''

    const handleScan = useCallback(async (raw, source) => {
        const r = await lookupBarcode(raw)
        setResult(r)
        nextLogId.current += 1
        const entry = {
            id: nextLogId.current,
            source,
            barcode: r.barcode || String(raw).trim(),
            status: r.status,
            time: new Date().toLocaleTimeString('en-IN'),
        }
        setLog((entries) => [entry, ...entries].slice(0, 10))
    }, [])

    // Listens for keyboard-style scanners when no input field has focus.
    useBarcodeScanner({ onScan: (code) => handleScan(code, 'keyboard') })

    function handleManualSubmit(e) {
        e.preventDefault()
        handleScan(manual, 'manual')
        setManual('')
        inputRef.current?.focus()
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Scanner test</h2>
            <p className="text-sm text-slate-600">
                Test barcode lookup without a scanner. Type a barcode, or use the simulator below.
                A real keyboard-style scanner will also work here when no text box has focus.
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <FormField label="Barcode" htmlFor="scan-input">
                    <input
                        id="scan-input"
                        ref={inputRef}
                        autoFocus
                        autoComplete="off"
                        className={inputClass}
                        value={manual}
                        onChange={(e) => setManual(e.target.value)}
                        placeholder="Type or scan a barcode, then press Enter"
                    />
                </FormField>
                <button type="submit" className={primaryButton}>
                    Look up
                </button>
            </form>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <FormField label="Simulated item" htmlFor="sim-item">
                    <select
                        id="sim-item"
                        className={inputClass}
                        value={selectedBarcode}
                        onChange={(e) => setSelected(e.target.value)}
                    >
                        {items?.map(({ variant, product }) => (
                            <option key={variant.id} value={variant.barcode}>
                                {product.name} · {variant.size} · {variant.barcode}
                            </option>
                        ))}
                    </select>
                </FormField>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={secondaryButton}
                        disabled={!selectedBarcode}
                        onClick={() => simulateKeyboardScan(selectedBarcode)}
                    >
                        Simulate keyboard scan
                    </button>
                    <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => simulateKeyboardScan('CLO999999')}
                    >
                        Scan unknown barcode
                    </button>
                </div>
            </div>

            <ScanResultCard result={result} />

            {log.length > 0 && (
                <div className="rounded-xl bg-white p-4 shadow-sm">
                    <h3 className="mb-2 font-semibold">Recent scans</h3>
                    <ul className="space-y-1 text-sm text-slate-600">
                        {log.map((entry) => (
                            <li key={entry.id}>
                                {entry.time} · {SOURCE_LABEL[entry.source]} · {entry.barcode} · {entry.status}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}