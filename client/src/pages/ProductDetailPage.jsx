import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { archiveProduct, getProduct, updateProduct } from '../db/productRepo'
import { archiveVariant, listVariantsByProduct } from '../db/variantRepo'
import EntryEditForm from '../components/EntryEditForm'
import ProductForm from '../components/ProductForm'
import StockAdjustForm from '../components/StockAdjustForm'
import { dangerButton, primaryButton, secondaryButton } from '../components/styles'
import { formatINR } from '../lib/money'

const dateOnly = (iso) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

// Pieces as a number, meters (stored as centimetres) as "2.35 m".
const quantityText = (unit, n) => (unit === 'meter' ? `${(n / 100).toFixed(2)} m` : String(n))

// All entries of the same size are grouped, newest entry first, with their total stock.
function groupBySize(variants) {
    const map = new Map()
    for (const v of variants) {
        const key = String(v.size ?? '').trim().toLowerCase()
        if (!map.has(key)) {
            map.set(key, { key, label: String(v.size ?? '').trim() || 'No size', unit: v.unit ?? 'piece', entries: [], total: 0 })
        }
        const group = map.get(key)
        group.entries.push(v)
        if (v.status === 'active') group.total += v.currentStock
    }
    const groups = [...map.values()]
    for (const g of groups) {
        g.entries.sort(
            (a, b) => b.createdAt.localeCompare(a.createdAt) || b.barcode.localeCompare(a.barcode),
        )
    }
    return groups.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

export default function ProductDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    // undefined = loading, null = not found
    const data = useLiveQuery(async () => {
        const product = await getProduct(id)
        if (!product) return null
        return { product, variants: await listVariantsByProduct(id) }
    }, [id])

    const [editingProduct, setEditingProduct] = useState(false)
    const [panel, setPanel] = useState(null) // { id, mode: 'edit' | 'adjust' }

    if (data === undefined) return <p className="text-slate-500">Loading...</p>
    if (data === null) {
        return (
            <div className="space-y-2">
                <p>Product not found.</p>
                <Link to="/products" className="text-blue-600">
                    ← Back to products
                </Link>
            </div>
        )
    }

    const { product, variants } = data
    const groups = groupBySize(variants)
    const unitOfProduct = groups[0]?.unit ?? 'piece'
    const archivedProduct = product.status === 'archived'

    async function handleArchiveProduct() {
        if (!window.confirm(`Archive ${product.name}? Its stock can no longer be sold.`)) return
        await archiveProduct(id)
        navigate('/products')
    }

    async function handleArchiveEntry(entry) {
        if (!window.confirm('Archive this entry? Its stock can no longer be sold.')) return
        await archiveVariant(entry.id)
        setPanel(null)
    }

    return (
        <div className="space-y-4">
            <Link to="/products" className="text-sm text-blue-600">
                ← Back to products
            </Link>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold">{product.name}</h2>
                    <p className="text-sm text-slate-500">
                        {[product.brand, product.category].filter(Boolean).join(' · ') || 'No company or category'}
                    </p>
                    {unitOfProduct === 'meter' && (
                        <p className="text-xs text-slate-500">Sold by the meter</p>
                    )}
                    {product.discountAllowed === false && (
                        <p className="text-xs text-amber-700">This product never takes a discount.</p>
                    )}
                    {archivedProduct && <p className="text-sm font-semibold text-red-700">Archived</p>}
                </div>

                {editingProduct ? (
                    <ProductForm
                        initial={product}
                        onSubmit={async (values) => {
                            await updateProduct(id, values)
                            setEditingProduct(false)
                        }}
                        onCancel={() => setEditingProduct(false)}
                    />
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {!archivedProduct && (
                            <Link
                                to="/stock/new"
                                state={{
                                    product: {
                                        name: product.name,
                                        category: product.category,
                                        brand: product.brand,
                                        unit: unitOfProduct,
                                    },
                                }}
                                className={primaryButton}
                            >
                                Add stock
                            </Link>
                        )}
                        <button type="button" className={secondaryButton} onClick={() => setEditingProduct(true)}>
                            Edit product
                        </button>
                        {!archivedProduct && (
                            <button type="button" className={dangerButton} onClick={handleArchiveProduct}>
                                Archive product
                            </button>
                        )}
                    </div>
                )}
            </div>

            {groups.length === 0 && (
                <p className="rounded-xl bg-white p-6 text-center text-slate-500 shadow-sm">
                    No stock entered yet.
                </p>
            )}

            {groups.map((group) => (
                <section
                    key={group.key}
                    data-testid="size-group"
                    className="space-y-3 rounded-xl bg-white p-4 shadow-sm"
                >
                    <div>
                        <h3 className="text-lg font-semibold">
                            {group.label === 'No size' ? 'No size' : `Size ${group.label}`}
                        </h3>
                        <p className="text-sm text-slate-600">
                            Total {quantityText(group.unit, group.total)} in stock · {group.entries.length}{' '}
                            {group.entries.length === 1 ? 'entry' : 'entries'}
                        </p>
                    </div>

                    <ul className="space-y-2">
                        {group.entries.map((entry) => {
                            const archived = entry.status !== 'active'
                            const low = !archived && entry.currentStock <= entry.reorderThreshold
                            const per = entry.unit === 'meter' ? ' / m' : ''
                            return (
                                <li
                                    key={entry.id}
                                    data-testid="entry-card"
                                    className={`rounded-lg border p-3 ${archived ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold">
                                                Added {dateOnly(entry.createdAt)} · {quantityText(entry.unit, entry.currentStock)} left
                                            </p>
                                            <p className="text-sm">
                                                Cost {formatINR(entry.costPaise)}{per} · Selling {formatINR(entry.sellingPricePaise)}{per}
                                                {entry.mrpPaise !== entry.sellingPricePaise && ` · MRP ${formatINR(entry.mrpPaise)}${per}`}
                                            </p>
                                            <p className="font-mono text-xs">{entry.barcode}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {low && (
                                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                                    Low stock
                                                </span>
                                            )}
                                            {archived && (
                                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                    Archived
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {!archived && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <button type="button" className={secondaryButton}
                                                onClick={() => setPanel({ id: entry.id, mode: 'edit' })}>
                                                Edit
                                            </button>
                                            <button type="button" className={secondaryButton}
                                                onClick={() => setPanel({ id: entry.id, mode: 'adjust' })}>
                                                Adjust stock
                                            </button>
                                            <button type="button" className={dangerButton} onClick={() => handleArchiveEntry(entry)}>
                                                Archive
                                            </button>
                                        </div>
                                    )}

                                    {panel?.id === entry.id && panel.mode === 'edit' && (
                                        <EntryEditForm entry={entry} onDone={() => setPanel(null)} />
                                    )}
                                    {panel?.id === entry.id && panel.mode === 'adjust' && (
                                        <StockAdjustForm variant={entry} onDone={() => setPanel(null)} />
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </section>
            ))}
        </div>
    )
}