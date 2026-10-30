import { useEffect, useState } from 'react'
import { generateBarcodeSvg } from '../labels/barcodeSvg'

export default function LabelPreview({ label, widthMm, heightMm }) {
    const barcodeHeightMm = Math.max(6, Math.round(heightMm * 0.32))
    const [svg, setSvg] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        generateBarcodeSvg({
            value: label.barcode,
            symbology: label.symbology,
            heightMm: barcodeHeightMm,
        })
            .then((result) => {
                if (!cancelled) {
                    setSvg(result)
                    setError('')
                }
            })
            .catch((err) => {
                if (!cancelled) setError(err.message)
            })
        return () => {
            cancelled = true
        }
    }, [label.barcode, label.symbology, barcodeHeightMm])

    return (
        <div
            data-testid="label"
            className="box-border overflow-hidden border border-dashed border-slate-300 bg-white text-black print:border-0"
            style={{
                width: `${widthMm}mm`,
                height: `${heightMm}mm`,
                padding: '1.5mm',
                breakInside: 'avoid',
            }}
        >
            <p className="truncate font-semibold leading-tight" style={{ fontSize: '2.8mm' }}>
                {label.title}
            </p>
            <p className="truncate leading-tight" style={{ fontSize: '2.4mm' }}>
                Size {label.size} · {label.sku}
            </p>

            <div style={{ height: `${barcodeHeightMm}mm`, margin: '0.8mm 2mm' }}>
                {error ? (
                    <p className="text-red-600" style={{ fontSize: '2.2mm' }}>
                        {error}
                    </p>
                ) : (
                    <div
                        style={{ width: '100%', height: '100%' }}
                        // The SVG is produced by the barcode library from a validated barcode value.
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                )}
            </div>

            <div className="flex justify-between leading-tight" style={{ fontSize: '2.4mm' }}>
                <span className="font-mono">{label.barcode}</span>
                {label.priceText && (
                    <span data-testid="label-price" className="font-semibold">
                        {label.priceText}
                    </span>
                )}
            </div>
        </div>
    )
}