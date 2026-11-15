import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { archiveProduct, getProduct, updateProduct } from '../db/productRepo'
import { createVariant, listVariantsByProduct, updateVariant } from '../db/variantRepo'
import ProductForm from '../components/ProductForm'
import VariantForm from '../components/VariantForm'
import StockAdjustForm from '../components/StockAdjustForm'
import { dangerButton, primaryButton, secondaryButton } from '../components/styles'
import { formatINR } from '../lib/money'

export default function ProductDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()

    // undefined = still loading, null = not found
    const product = useLiveQuery(async () => (await getProduct(id)) ?? null, [id])
    const variants = useLiveQuery(() => listVariantsByProduct(id), [id])

    const [editingProduct, setEditingProduct] = useState(false)
    const [variantFormId, setVariantFormId] = useState(null) // 'new' | variant id | null
    const [adjustId, setAdjustId] = useState(null)

    if (product === undefined) return <p className="text-slate-500">Loading...</p>
    if (product === null) {
        return (
            <div className="space-y-2">
                <p>Product not found.</p>
                <Link to="/products" className="text-blue-600">
                    ← Back to products
                </Link>
            </div>
        )
    }

    const archived = product.status === 'archived'
    const activeVariants = (variants ?? []).filter((v) => v.status === 'active')

    async function handleArchive() {
        const ok = window.confirm(
            `Archive "${product.name}"? It will be hidden from the product list and billing.`,
        )
        if (!ok) return
        await archiveProduct(product.id)
        navigate('/products')
    }

    return (
        <div className="space-y-4">
            <Link to="/products" className="text-sm text-blue-600">
                ← Back to products
            </Link>

            {archived && (
                <p className="rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
                    This product is archived.
                </p>
            )}

            <div className="rounded-xl bg-white p-4 shadow-sm">
                {editingProduct ? (
                    <ProductForm
                        initial={product}
                        submitLabel="Save changes"
                        onCancel={() => setEditingProduct(false)}
                        onSubmit={async (values) => {
                            await updateProduct(product.id, values)
                            setEditingProduct(false)
                        }}
                    />
                ) : (
                    <div className="flex items-start justify-between gap-2">
                        <div>
                                <h2 className="text-xl font-bold">
                                    {product.name}
                                    {product.discountAllowed === false && (
                                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-800">
                                            No discount
                                        </span>
                                    )}
                                </h2>
                            <p className="text-sm text-slate-500">
                                {[product.brand, product.category].filter(Boolean).join(' · ')}
                            </p>
                            {product.supplier && (
                                <p className="text-sm text-slate-500">Supplier: {product.supplier}</p>
                            )}
                        </div>
                        {!archived && (
                            <button className={secondaryButton} onClick={() => setEditingProduct(true)}>
                                Edit
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Variants</h3>
                {!archived && variantFormId !== 'new' && (
                    <button className={primaryButton} onClick={() => setVariantFormId('new')}>
                        + Add variant
                    </button>
                )}
            </div>

            {variantFormId === 'new' && (
                <div className="rounded-xl bg-white p-4 shadow-sm">
                    <VariantForm
                        onCancel={() => setVariantFormId(null)}
                        onSubmit={async (payload) => {
                            await createVariant({ ...payload, productId: product.id })
                            setVariantFormId(null)
                        }}
                    />
                </div>
            )}

            {variants !== undefined && activeVariants.length === 0 && variantFormId !== 'new' && (
                <p className="text-slate-500">No variants yet. Add a size and colour to start selling.</p>
            )}

            <ul className="space-y-2">
                {activeVariants.map((v) => (
                    <li key={v.id} className="rounded-xl bg-white p-4 shadow-sm">
                        {variantFormId === v.id ? (
                            <VariantForm
                                initial={v}
                                onCancel={() => setVariantFormId(null)}
                                onSubmit={async (payload) => {
                                    await updateVariant(v.id, payload)
                                    setVariantFormId(null)
                                }}
                            />
                        ) : (
                            <>
                                <div className="flex justify-between gap-2">
                                        <p className="font-semibold">Size {v.size}</p>
                                    <p className="font-semibold">{formatINR(v.sellingPricePaise)}</p>
                                </div>
                                <p className="text-sm text-slate-500">
                                    SKU {v.sku} · Barcode {v.barcode}
                                </p>
                                <p className="text-sm text-slate-500">
                                    MRP {formatINR(v.mrpPaise)} · Cost {formatINR(v.costPaise)} · Tax{' '}
                                    {v.taxRatePercent}%
                                </p>
                                <p
                                    className={`mt-1 text-sm font-medium ${v.currentStock <= v.reorderThreshold ? 'text-red-600' : 'text-slate-700'
                                        }`}
                                >
                                    Stock: {v.currentStock}
                                    {v.currentStock <= v.reorderThreshold && ' (low)'}
                                </p>

                                {!archived && (
                                    <div className="mt-3 flex gap-2">
                                        <button className={secondaryButton} onClick={() => setVariantFormId(v.id)}>
                                            Edit
                                        </button>
                                        <button className={secondaryButton} onClick={() => setAdjustId(v.id)}>
                                            Adjust stock
                                        </button>
                                    </div>
                                )}

                                {adjustId === v.id && (
                                    <StockAdjustForm variant={v} onDone={() => setAdjustId(null)} />
                                )}
                            </>
                        )}
                    </li>
                ))}
            </ul>

            {!archived && (
                <div className="pt-4">
                    <button className={dangerButton} onClick={handleArchive}>
                        Archive product
                    </button>
                </div>
            )}
        </div>
    )
}