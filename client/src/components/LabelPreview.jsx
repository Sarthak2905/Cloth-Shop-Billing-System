import { useEffect, useState } from 'react'
import { generateBarcodeSvg } from '../labels/barcodeSvg'

const PADDING_MM = 1.5

export default function LabelPreview({ label, widthMm, heightMm }) {
    // A label with no size line has room for a taller barcode.
    const barcodeHeightMm = Math.max(6, Math.round(heightMm * (label.detail ? 0.36 : 0.44)))
    // The width the barcode may use, so its bars can be a whole number of printer dots wide.
    const availableMm = widthMm - 2 * PADDING_MM
    const [svg, setSvg] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        generateBarcodeSvg({
            value: label.barcode,
            symbology: label.symbology,
            heightMm: barcodeHeightMm,
            availableMm,
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
    }, [label.barcode, label.symbology, barcodeHeightMm, availableMm])

    return (
        <div
            data-testid="label"
            className="box-border overflow-hidden border border-dashed border-slate-300 bg-white text-black print:border-0"
            style={{
                width: `${widthMm}mm`,
                height: `${heightMm}mm`,
                padding: `${PADDING_MM}mm`,
                breakInside: 'avoid',
            }}
        >
            <p className="truncate font-semibold leading-tight" style={{ fontSize: '2.8mm' }}>
                {label.title}
            </p>
            {label.detail && (
                <p data-testid="label-detail" className="truncate leading-tight" style={{ fontSize: '2.4mm' }}>
                    {label.detail}
                </p>
            )}

            {/* hard bar edges, and the barcode centred in the space it has */}
            <div
                data-testid="label-barcode"
                className="[shape-rendering:crispEdges] [&_svg]:[shape-rendering:crispEdges]"
                style={{ height: `${barcodeHeightMm}mm`, margin: '0.8mm 0' }}
            >
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