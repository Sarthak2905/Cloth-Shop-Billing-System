import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { searchProducts } from '../db/catalogRepo'
import { seedSampleData } from '../db/sampleData'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { formatQuantity } from '../lib/quantity'

export default function ProductsPage() {
    const [query, setQuery] = useState('')
    const rows = useLiveQuery(() => searchProducts(query), [query])

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <h2 className="text-xl font-bold">Products</h2>
                <div className="grid grid-cols-2 gap-2">
                    <Link to="/import" className={`${secondaryButton} text-center`}>
                        Import from file
                    </Link>
                    <Link to="/products/new" className={`${primaryButton} text-center`}>
                        + New product
                    </Link>
                </div>
            </div>

            <input
                type="search"
                className={inputClass}
                placeholder="Search by name, SKU or barcode"
                aria-label="Search products"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />

            {rows === undefined && <p className="text-slate-500">Loading...</p>}

            {rows && rows.length === 0 && (
                <div className="rounded-xl bg-white p-6 text-center shadow-sm">
                    {query ? (
                        <p>No products match “{query}”.</p>
                    ) : (
                        <>
                            <p>No products yet.</p>
                            <button
                                type="button"
                                className={`${secondaryButton} mt-3`}
                                onClick={() => seedSampleData()}
                            >
                                Load sample products
                            </button>
                        </>
                    )}
                </div>
            )}

            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rows?.map(({ product, variants, unit, totalStock, lowStock }) => (
                    <li key={product.id}>
                        <Link
                            to={`/products/${product.id}`}
                            className="block h-full rounded-xl bg-white p-4 shadow-sm hover:shadow"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold">{product.name}</p>
                                    <p className="text-sm text-slate-500">
                                        {[product.brand, product.category].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                {lowStock && (
                                    <span className="shrink-0 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                        Low stock
                                    </span>
                                )}
                            </div>
                            <p className="mt-2 text-sm text-slate-600">
                                {variants.length} {variants.length === 1 ? 'variant' : 'variants'} ·{' '}
                                {formatQuantity(totalStock, unit)} in stock
                            </p>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}