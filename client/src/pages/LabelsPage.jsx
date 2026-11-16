import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listSellableVariants } from '../db/catalogRepo'
import { chooseSymbology } from '../labels/ean'
import { LABEL_PRESETS, buildLabel, validateLabelSize } from '../labels/labelModel'
import LabelPreview from '../components/LabelPreview'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { clearLabelPreset, readLabelPreset } from '../lib/labelPreset'

const MAX_LABELS = 200

const stockText = (variant) =>
    variant.unit === 'meter' ? `${(variant.currentStock / 100).toFixed(2)} m` : String(variant.currentStock)

export default function LabelsPage() {
    const items = useLiveQuery(() => listSellableVariants(), [])
    // Coming from "Add stock", the new entries already have their copies filled in.
    const [copies, setCopies] = useState(() => readLabelPreset())
    const [presetId, setPresetId] = useState(LABEL_PRESETS[0].id)
    const [customWidth, setCustomWidth] = useState('50')
    const [customHeight, setCustomHeight] = useState('25')
    const [priceMode, setPriceMode] = useState('mrp')
    const [search, setSearch] = useState('')

    useEffect(() => {
        clearLabelPreset()
    }, [])

    const preset = LABEL_PRESETS.find((p) => p.id === presetId)
    const widthMm = preset ? preset.widthMm : Number(customWidth)
    const heightMm = preset ? preset.heightMm : Number(customHeight)
    const sizeError = validateLabelSize(widthMm, heightMm)

    const query = search.trim().toLowerCase()
    const shown = (items ?? []).filter(
        ({ variant, product }) =>
            !query ||
            product.name.toLowerCase().includes(query) ||
            variant.barcode.toLowerCase().includes(query),
    )

    const labels = useMemo(
        () =>
            (items ?? []).flatMap(({ variant, product }) => {
                const count = copies[variant.id] ?? 0
                if (!count) return []
                const label = buildLabel(variant, product, { priceMode })
                return Array.from({ length: count }, (_, i) => ({ key: `${variant.id}-${i}`, label }))
            }),
        [items, copies, priceMode],
    )
    const visible = labels.slice(0, MAX_LABELS)

    function setCopiesFor(variantId, text) {
        const count = Math.max(0, Math.min(99, Math.floor(Number(text)) || 0))
        setCopies((c) => ({ ...c, [variantId]: count }))
    }

    function oneOfEachShown() {
        setCopies((c) => {
            const next = { ...c }
            for (const { variant } of shown) next[variant.id] = 1
            return next
        })
    }

    // One label for each piece in stock (at most 99 for one entry; fabric by the meter gets 1).
    function copiesFromStock() {
        setCopies((c) => {
            const next = { ...c }
            for (const { variant } of shown) {
                next[variant.id] =
                    variant.unit === 'meter' ? 1 : Math.max(0, Math.min(99, variant.currentStock))
            }
            return next
        })
    }

    return (
        <div className="space-y-4">
            <div className="space-y-4 print:hidden">
                <h2 className="text-xl font-bold">Barcode labels</h2>

                <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                    <FormField label="Label size" htmlFor="label-size">
                        <select
                            id="label-size"
                            className={inputClass}
                            value={presetId}
                            onChange={(e) => setPresetId(e.target.value)}
                        >
                            {LABEL_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label}
                                </option>
                            ))}
                            <option value="custom">Custom size</option>
                        </select>
                    </FormField>

                    {!preset && (
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Width (mm)" htmlFor="label-width">
                                <input
                                    id="label-width"
                                    inputMode="decimal"
                                    className={inputClass}
                                    value={customWidth}
                                    onChange={(e) => setCustomWidth(e.target.value)}
                                />
                            </FormField>
                            <FormField label="Height (mm)" htmlFor="label-height">
                                <input
                                    id="label-height"
                                    inputMode="decimal"
                                    className={inputClass}
                                    value={customHeight}
                                    onChange={(e) => setCustomHeight(e.target.value)}
                                />
                            </FormField>
                        </div>
                    )}
                    {sizeError && <p className="text-sm text-red-600">{sizeError}</p>}

                    <FormField label="Price on label" htmlFor="label-price-mode">
                        <select
                            id="label-price-mode"
                            className={inputClass}
                            value={priceMode}
                            onChange={(e) => setPriceMode(e.target.value)}
                        >
                            <option value="mrp">MRP</option>
                            <option value="selling">Selling price</option>
                            <option value="none">No price</option>
                        </select>
                    </FormField>
                </div>

                <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                    <FormField label="Search items" htmlFor="label-search">
                        <input
                            id="label-search"
                            className={inputClass}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Name or barcode"
                        />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={secondaryButton}
                            disabled={!shown.length}
                            onClick={oneOfEachShown}
                        >
                            Set 1 copy of each shown
                        </button>
                        <button
                            type="button"
                            className={secondaryButton}
                            disabled={!shown.length}
                            onClick={copiesFromStock}
                        >
                            Copies = stock for items shown
                        </button>
                        <button type="button" className={secondaryButton} onClick={() => setCopies({})}>
                            Clear all copies
                        </button>
                    </div>

                    {items && items.length === 0 && (
                        <p className="text-sm text-slate-500">No products yet. Add stock first.</p>
                    )}

                    <ul className="space-y-2">
                        {shown.map(({ variant, product }) => {
                            const { warning } = chooseSymbology(variant.barcode)
                            return (
                                <li
                                    key={variant.id}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {product.name}
                                            {variant.size ? ` · Size ${variant.size}` : ''}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {variant.barcode} · Stock {stockText(variant)}
                                        </p>
                                        {warning && <p className="text-xs text-amber-700">{warning}</p>}
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        max="99"
                                        aria-label={`Copies of ${product.name} size ${variant.size}`}
                                        className="w-20 rounded-lg border border-slate-300 px-2 py-2"
                                        value={copies[variant.id] ?? 0}
                                        onChange={(e) => setCopiesFor(variant.id, e.target.value)}
                                    />
                                </li>
                            )
                        })}
                    </ul>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        className={primaryButton}
                        disabled={!visible.length || Boolean(sizeError)}
                        onClick={() => window.print()}
                    >
                        Print labels
                    </button>
                    <p className="text-sm text-slate-600">
                        {labels.length} labels
                        {labels.length > MAX_LABELS && ` (showing the first ${MAX_LABELS})`}
                    </p>
                </div>
                <p className="text-xs text-slate-500">
                    Print on plain paper or choose &ldquo;Save as PDF&rdquo;. A real label printer comes
                    later. Print at 100% scale (no &ldquo;fit to page&rdquo;) so the size is right.
                </p>
            </div>

            {!sizeError && (
                <div id="label-sheet" className="flex flex-wrap gap-2 print:gap-1">
                    {visible.map(({ key, label }) => (
                        <LabelPreview key={key} label={label} widthMm={widthMm} heightMm={heightMm} />
                    ))}
                </div>
            )}
        </div>
    )
}