import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '../db/settingsRepo'
import { createPrinter } from '../printing/printerFactory'
import { printReceipt } from '../printing/printService'
import { primaryButton } from './styles'

const DONE_TEXT = {
    simulated: 'Simulated print only: nothing came out of a printer. Choose "Windows printer" in Settings.',
    handed_off: 'Sent to the printer.',
    device_confirmed: 'Printed.',
}

// One button that prints the receipt of a saved sale on the printer chosen in
// Settings. If "Print receipts automatically" is on, it prints once by itself.
// `createPrinterFn` can be replaced in tests.
export default function ReceiptPrintButton({ saleId, createPrinterFn = createPrinter }) {
    const settings = useLiveQuery(() => getSettings(), [])
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState(null)
    const autoPrinted = useRef(null)

    const print = useCallback(async () => {
        if (!settings) return
        setBusy(true)
        setMessage(null)
        try {
            const job = await printReceipt({
                saleId,
                printer: createPrinterFn(settings.receiptPrinter),
            })
            setMessage(
                job.status === 'completed'
                    ? { type: 'ok', text: DONE_TEXT[job.confirmation] ?? 'Done.' }
                    : { type: 'error', text: job.error },
            )
        } catch (err) {
            setMessage({ type: 'error', text: err.message })
        } finally {
            setBusy(false)
        }
    }, [saleId, settings, createPrinterFn])

    useEffect(() => {
        if (settings?.autoPrintReceipt && autoPrinted.current !== saleId) {
            autoPrinted.current = saleId
            print()
        }
    }, [settings, saleId, print])

    return (
        <div className="space-y-2">
            <button type="button" className={primaryButton} disabled={busy || !settings} onClick={print}>
                {busy ? 'Printing...' : 'Print receipt'}
            </button>
            {message && (
                <p
                    data-testid="print-button-message"
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={`rounded-lg p-2 text-sm ${message.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}
                >
                    {message.text}
                </p>
            )}
        </div>
    )
}