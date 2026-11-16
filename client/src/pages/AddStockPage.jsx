import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { listProducts } from '../db/productRepo'
import { addStockEntries } from '../db/stockEntryRepo'
import FormField from '../components/FormField'
import { dangerButton, inputClass, primaryButton, secondaryButton } from '../components/styles'
import { AppError } from '../lib/errors'
import { isBlankInput, parseMoneyInput, parseWholeInput } from '../lib/entryInput'
import { newId } from '../lib/id'
import { setLabelPreset } from '../lib/labelPreset'
import { formatMeters, parseLength } from '../lib/quantity'
import { isStorageFull } from '../lib/storageErrors'

// A new row starts with the cost and prices of the row above it, to save typing.
const newRow = (from = {}) => ({
    key: newId(),
    size: '',
    quantity: '',
    cost: from.cost ?? '',
    price: from.price ?? '',
    mrp: from.mrp ?? '',
})

const stockLine = (entry) =>
    entry.unit === 'meter' ? `${formatMeters(entry.currentStock)} m` : `${entry.currentStock} pcs`

export default function AddStockPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const start = location.state?.product
    const products = useLiveQuery(() => listProducts(), [])

    const [name, setName] = useState(start?.name ?? '')
    const [brand, setBrand] = useState(start?.brand ?? '')
    const [category, setCategory] = useState(start?.category ?? '')
    const [unit, setUnit] = useState(start?.unit === 'meter' ? 'meter' : 'piece')
    const [tax, setTax] = useState('5')
    const [includesTax, setIncludesTax] = useState(true)
    const [rows, setRows] = useState(() => [newRow()])
    const [errors, setErrors] = useState({ rows: {} })
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(null)

    const meter = unit === 'meter'
    const per = meter ? ' per meter' : ''

    const setRowField = (key, field) => (e) =>
        setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: e.target.value } : r)))

    function addRow() {
        const last = rows[rows.length - 1]
        setRows([...rows, newRow({ cost: last.cost, price: last.price, mrp: last.mrp })])
    }

    function removeRow(key) {
        setRows((list) => (list.length > 1 ? list.filter((r) => r.key !== key) : list))
    }

    function handleUnitChange(e) {
        setUnit(e.target.value)
        setErrors({ rows: {} })
    }

    // Picking a product name you used before fills its company and category.
    function handleNameBlur() {
        const wanted = name.trim().toLowerCase()
        if (!wanted || !products) return
        const match = products.find((p) => p.name.trim().toLowerCase() === wanted)
        if (!match) return
        if (!category.trim() && match.category) setCategory(match.category)
        if (!brand.trim() && match.brand) setBrand(match.brand)
    }

    // A row with neither a size nor a quantity is ignored (it may only carry copied prices).
    function check() {
        const found = { rows: {} }
        if (!name.trim()) found.name = 'Enter the product name'
        else if (name.trim().length > 120) found.name = 'The name is too long (120 characters at most)'
        if (brand.trim().length > 60) found.brand = 'Too long (60 characters at most)'
        if (category.trim().length > 60) found.category = 'Too long (60 characters at most)'

        const taxNumber = Number(tax)
        if (isBlankInput(tax) || !Number.isFinite(taxNumber) || taxNumber < 0 || taxNumber > 100) {
            found.tax = 'Tax must be a number from 0 to 100'
        }

        const prepared = []
        for (const row of rows) {
            if (isBlankInput(row.size) && isBlankInput(row.quantity)) continue
            const e = {}
            if (row.size.trim().length > 50) e.size = 'Too long (50 characters at most)'

            // Pieces are whole numbers. Fabric is typed in meters (25.5) or centimetres
            // (80 cm) and kept as whole centimetres.
            let quantity
            if (meter) {
                quantity = parseLength(row.quantity, 'm')
                if (quantity === null || quantity < 1) e.quantity = 'Enter meters like 25 or 25.5'
            } else {
                quantity = parseWholeInput(row.quantity)
                if (quantity === null || quantity < 1) e.quantity = 'Enter the number of pieces (1 or more)'
            }

            const sellingPricePaise = parseMoneyInput(row.price)
            if (sellingPricePaise === null) e.price = 'Enter the selling price like 599 or 599.50'
            let costPaise = 0
            if (!isBlankInput(row.cost)) {
                costPaise = parseMoneyInput(row.cost)
                if (costPaise === null) e.cost = 'Enter the cost like 320 or 320.50'
            }
            let mrpPaise
            if (!isBlankInput(row.mrp)) {
                mrpPaise = parseMoneyInput(row.mrp)
                if (mrpPaise === null) e.mrp = 'Enter the MRP like 799 or 799.50'
            }
            if (Object.keys(e).length > 0) found.rows[row.key] = e
            else prepared.push({ size: row.size.trim(), quantity, costPaise, sellingPricePaise, mrpPaise })
        }

        if (prepared.length === 0 && Object.keys(found.rows).length === 0) {
            found._form = 'Add at least one size with its quantity and selling price'
        }
        const hasError =
            found.name || found.brand || found.category || found.tax || found._form ||
            Object.keys(found.rows).length > 0
        return { found, prepared, taxNumber, ok: !hasError }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        if (saving) return
        const { found, prepared, taxNumber, ok } = check()
        setErrors(found)
        if (!ok) return

        setSaving(true)
        try {
            const result = await addStockEntries({
                name,
                brand,
                category,
                unit,
                taxRatePercent: taxNumber,
                priceIncludesTax: includesTax,
                rows: prepared,
            })
            setSaved(result)
        } catch (err) {
            let message = 'Could not save. Nothing was saved. Please try again.'
            if (err instanceof AppError) message = err.message
            else {
                console.error(err)
                if (isStorageFull(err)) message = 'This device is out of storage space. Nothing was saved.'
            }
            setErrors({ rows: {}, _form: message })
        } finally {
            setSaving(false)
        }
    }

    function resetAll() {
        setName('')
        setBrand('')
        setCategory('')
        setRows([newRow()])
        setErrors({ rows: {} })
        setSaved(null)
    }

    function addAnotherSize() {
        const last = rows[rows.length - 1]
        setRows([newRow({ cost: last.cost, price: last.price, mrp: last.mrp })])
        setErrors({ rows: {} })
        setSaved(null)
    }

    // One label for each piece; a roll of fabric gets one label.
    function printLabels() {
        const copies = Object.fromEntries(
            saved.entries.map((entry) => [entry.id, entry.unit === 'meter' ? 1 : entry.currentStock]),
        )
        setLabelPreset(copies)
        navigate('/labels')
    }

    if (saved) {
        const count = saved.entries.length
        return (
            <div className="space-y-4">
                <h2 className="text-xl font-bold">Add stock</h2>
                <div
                    data-testid="stock-saved"
                    role="status"
                    className="space-y-3 rounded-xl border-l-4 border-green-500 bg-white p-4 shadow-sm"
                >
                    <p className="font-semibold text-green-700">Stock saved</p>
                    <p className="text-lg font-bold">
                        {saved.product.name}: {count} {count === 1 ? 'entry' : 'entries'} added
                    </p>
                    <ul className="space-y-1 text-sm text-slate-600">
                        {saved.entries.map((entry) => (
                            <li key={entry.id}>
                                {entry.size ? `${entry.unit === 'meter' ? '' : 'Size '}${entry.size}` : 'No size'} ·{' '}
                                {stockLine(entry)} · <span className="font-mono">{entry.barcode}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={primaryButton} onClick={printLabels}>
                            Print labels
                        </button>
                        <button type="button" className={secondaryButton} onClick={addAnotherSize}>
                            Add another size
                        </button>
                        <button type="button" className={secondaryButton} onClick={resetAll}>
                            Add more stock
                        </button>
                        <Link to={`/products/${saved.product.id}`} className={secondaryButton}>
                            View product
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    const anyNoCost = rows.some(
        (r) => !(isBlankInput(r.size) && isBlankInput(r.quantity)) && isBlankInput(r.cost),
    )
    const names = [...new Set((products ?? []).map((p) => p.name))]

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Add stock</h2>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                    <FormField label="Product name" htmlFor="as-name" error={errors.name}>
                        <input
                            id="as-name"
                            list="product-names"
                            autoFocus={!start}
                            autoComplete="off"
                            className={inputClass}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={handleNameBlur}
                            placeholder="e.g. Cotton Shirt"
                        />
                    </FormField>
                    <datalist id="product-names">
                        {names.map((n) => (
                            <option key={n} value={n} />
                        ))}
                    </datalist>
                    <FormField
                        label="Sold by"
                        htmlFor="as-unit"
                        hint="Choose Meter for fabric sold by length. Prices are then per meter."
                    >
                        <select id="as-unit" className={inputClass} value={unit} onChange={handleUnitChange}>
                            <option value="piece">Piece</option>
                            <option value="meter">Meter</option>
                        </select>
                    </FormField>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <FormField label="Company / brand (optional)" htmlFor="as-brand" error={errors.brand}>
                            <input id="as-brand" className={inputClass} value={brand}
                                onChange={(e) => setBrand(e.target.value)} />
                        </FormField>
                        <FormField label="Category (optional)" htmlFor="as-category" error={errors.category}>
                            <input id="as-category" className={inputClass} value={category}
                                onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Shirts" />
                        </FormField>
                    </div>
                    <details className="text-sm">
                        <summary className="cursor-pointer text-slate-600">Tax options</summary>
                        <div className="mt-3 space-y-3">
                            <FormField label="Tax rate (%)" htmlFor="as-tax" error={errors.tax}
                                hint="Check the correct GST rate with your accountant.">
                                <input id="as-tax" inputMode="decimal" className={inputClass} value={tax}
                                    onChange={(e) => setTax(e.target.value)} />
                            </FormField>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={includesTax}
                                    onChange={(e) => setIncludesTax(e.target.checked)} />
                                Selling price already includes tax
                            </label>
                        </div>
                    </details>
                </div>

                {rows.map((row, index) => {
                    const e = errors.rows?.[row.key] ?? {}
                    return (
                        <div
                            key={row.key}
                            data-testid="entry-row"
                            className="space-y-3 rounded-xl bg-white p-4 shadow-sm"
                        >
                            <div className="flex items-center justify-between">
                                <p className="font-semibold">Entry {index + 1}</p>
                                {rows.length > 1 && (
                                    <button
                                        type="button"
                                        className={dangerButton}
                                        aria-label={`Remove entry ${index + 1}`}
                                        onClick={() => removeRow(row.key)}
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <FormField
                                    label={meter ? 'Design / shade (optional)' : 'Size'}
                                    htmlFor={`size-${row.key}`}
                                    error={e.size}
                                >
                                    <input id={`size-${row.key}`} className={inputClass} value={row.size}
                                        onChange={setRowField(row.key, 'size')}
                                        placeholder={meter ? 'Grey 101' : 'M, 32, Free size...'} />
                                </FormField>
                                <FormField
                                    label={meter ? 'Quantity (meters)' : 'Quantity'}
                                    hint={meter ? 'In meters, like 25.5. You can also type 80 cm.' : undefined}
                                    htmlFor={`qty-${row.key}`}
                                    error={e.quantity}
                                >
                                    <input id={`qty-${row.key}`} inputMode={meter ? 'decimal' : 'numeric'}
                                        className={inputClass} value={row.quantity}
                                        onChange={setRowField(row.key, 'quantity')} />
                                </FormField>
                                <FormField label={`Cost (₹${per})`} htmlFor={`cost-${row.key}`} error={e.cost}>
                                    <input id={`cost-${row.key}`} inputMode="decimal" className={inputClass}
                                        value={row.cost} onChange={setRowField(row.key, 'cost')} />
                                </FormField>
                                <FormField label={`Selling price (₹${per})`} htmlFor={`price-${row.key}`} error={e.price}>
                                    <input id={`price-${row.key}`} inputMode="decimal" className={inputClass}
                                        value={row.price} onChange={setRowField(row.key, 'price')} />
                                </FormField>
                                <FormField label={`MRP (₹${per}, optional)`} htmlFor={`mrp-${row.key}`} error={e.mrp}>
                                    <input id={`mrp-${row.key}`} inputMode="decimal" className={inputClass}
                                        value={row.mrp} onChange={setRowField(row.key, 'mrp')} />
                                </FormField>
                            </div>
                        </div>
                    )
                })}

                {anyNoCost && (
                    <p className="text-sm text-amber-700">
                        Without a cost, the profit on those entries cannot be worked out. You can add it later.
                    </p>
                )}

                {errors._form && (
                    <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                        {errors._form}
                    </p>
                )}

                <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondaryButton} onClick={addRow}>
                        Add another size
                    </button>
                    <button type="submit" className={primaryButton} disabled={saving}>
                        Save stock
                    </button>
                </div>
            </form>
        </div>
    )
}