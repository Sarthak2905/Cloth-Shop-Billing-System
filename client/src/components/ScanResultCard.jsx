import { formatINR } from '../lib/money'

const BORDER = {
    found: 'border-green-500',
    not_found: 'border-amber-500',
    invalid: 'border-amber-500',
    archived: 'border-red-500',
}

const TITLE = {
    not_found: 'Not found',
    invalid: 'Invalid barcode',
    archived: 'Item archived',
}

export default function ScanResultCard({ result }) {
    if (!result) {
        return <p className="text-slate-500">Scan or type a barcode to see the result.</p>
    }

    const border = BORDER[result.status] ?? 'border-slate-300'

    return (
        <div role="status" className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${border}`}>
            {result.status === 'found' ? (
                <FoundDetails variant={result.variant} product={result.product} />
            ) : (
                <>
                    <p className="font-semibold">{TITLE[result.status]}</p>
                    <p className="text-sm text-slate-600">{result.message}</p>
                </>
            )}
        </div>
    )
}

function FoundDetails({ variant, product }) {
    const outOfStock = variant.currentStock <= 0
    return (
        <>
            <p className="text-sm font-medium text-green-700">Item found</p>
            <p className="text-lg font-semibold">{product.name}</p>
            <p className="text-sm text-slate-600">
                Size {variant.size} · {formatINR(variant.sellingPricePaise)}
            </p>
            <p className="text-sm text-slate-500">
                SKU {variant.sku} · Barcode {variant.barcode}
            </p>
            <p
                className={`mt-1 text-sm font-medium ${outOfStock ? 'text-red-600' : 'text-slate-700'
                    }`}
            >
                {outOfStock ? 'Out of stock' : `In stock: ${variant.currentStock}`}
            </p>
        </>
    )
}