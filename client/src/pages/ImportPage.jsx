import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { applyImport } from '../importer/apply'
import { planImport } from '../importer/plan'
import { readTable } from '../importer/readTable'
import { buildTemplateCsv, downloadFile } from '../importer/template'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { AppError } from '../lib/errors'

const MAX_SHOWN = 100
const plural = (n, one, many) => (n === 1 ? one : many)

export default function ImportPage({ readTableFn = readTable, saveFile = downloadFile }) {
    const [stage, setStage] = useState('idle') // idle | reading | checked | importing | done
    const [plan, setPlan] = useState(null)
    const [error, setError] = useState('')
    const [result, setResult] = useState(null)
    const [fileKey, setFileKey] = useState(0)

    function reset() {
        setPlan(null)
        setError('')
        setResult(null)
        setStage('idle')
        setFileKey((k) => k + 1)
    }

    async function handleFile(e) {
        const file = e.target.files?.[0]
        setPlan(null)
        setError('')
        setResult(null)
        if (!file) {
            setStage('idle')
            return
        }
        setStage('reading')
        try {
            const rows = await readTableFn(file)
            const existing = {
                products: await db.products.toArray(),
                variants: await db.variants.toArray(),
            }
            const checked = planImport(rows, existing)
            if (checked.fatal) setError(checked.fatal)
            else setPlan(checked)
            setStage('checked')
        } catch (err) {
            console.error(err)
            setError(
                err instanceof AppError
                    ? err.message
                    : 'This file could not be read. Please check that it is a real Excel (.xlsx) or CSV file.',
            )
            setStage('idle')
        }
    }

    async function handleImport() {
        setStage('importing')
        setError('')
        try {
            setResult(await applyImport(plan))
            setPlan(null)
            setStage('done')
        } catch (err) {
            setError(err instanceof AppError ? err.message : 'The import failed. Nothing was saved.')
            setStage('checked')
        }
    }

    const summary = plan?.summary

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Import products from a file</h2>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">1. Get the sample file</p>
                <p className="text-sm text-slate-600">
                    One row for each product <strong>and size</strong>. Required columns: Product Name,
                    Category, Size, Selling Price. Everything else is optional.
                </p>
                <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => saveFile('product-import-sample.csv', buildTemplateCsv())}
                >
                    Download sample file
                </button>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                    <li>The sample has 4 example rows. Delete them before you add your own products.</li>
                    <li>Leave <strong>Barcode</strong> empty: the app gives each item its own barcode, and you print the labels on the Labels page.</li>
                    <li>Empty <strong>MRP</strong> uses the selling price. Empty <strong>Tax %</strong> uses 5.</li>
                    <li><strong>Opening Stock</strong> is the quantity you have now. Write <strong>No</strong> in <strong>Allow Discount</strong> for items that never get a discount.</li>
                    <li>Save your file as <strong>.xlsx</strong> (or CSV UTF-8). If Excel changes sizes like 2-3 into dates, format the Size column as Text.</li>
                </ul>
            </div>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">2. Choose your file</p>
                <FormField label="Product file" htmlFor="import-file" hint="Excel (.xlsx) or CSV. The first sheet is used.">
                    <input
                        key={fileKey}
                        id="import-file"
                        type="file"
                        accept=".xlsx,.csv,.txt"
                        className={inputClass}
                        onChange={handleFile}
                        disabled={stage === 'reading' || stage === 'importing'}
                    />
                </FormField>
                {stage === 'reading' && <p className="text-sm text-slate-500">Checking the file...</p>}
            </div>

            {error && (
                <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                    {error}
                </p>
            )}

            {plan && stage !== 'done' && (
                <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm" data-testid="import-summary">
                    <p className="font-semibold">3. Check and import</p>
                    <p className="text-lg font-bold text-green-700">
                        {summary.ready} {plural(summary.ready, 'item', 'items')} ready to import
                    </p>
                    {summary.ready > 0 && (
                        <p className="text-sm text-slate-600">
                            {summary.newProducts} new {plural(summary.newProducts, 'product', 'products')}
                            {summary.addedToExisting > 0 &&
                                `, and new sizes added to ${summary.addedToExisting} existing ${plural(summary.addedToExisting, 'product', 'products')}`}
                            .
                        </p>
                    )}
                    {summary.skippedExisting > 0 && (
                        <p className="text-sm text-slate-600">
                            {summary.skippedExisting} already in the app (skipped, nothing is changed).
                        </p>
                    )}
                    {summary.problems > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-red-700">
                                {summary.problems} {plural(summary.problems, 'row has', 'rows have')} a problem and will be skipped
                            </p>
                            <ul className="space-y-1 text-sm">
                                {plan.problems.slice(0, MAX_SHOWN).map((p) => (
                                    <li key={p.row} data-testid="import-problem" className="rounded bg-red-50 p-2 text-red-800">
                                        Row {p.row} · {p.name}: {p.message}
                                    </li>
                                ))}
                            </ul>
                            {plan.problems.length > MAX_SHOWN && (
                                <p className="text-sm text-slate-500">...and {plan.problems.length - MAX_SHOWN} more.</p>
                            )}
                            <p className="text-sm text-slate-500">
                                Fix these rows and upload the file again. Items that are already in the app are skipped, so nothing is duplicated.
                            </p>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={primaryButton}
                            onClick={handleImport}
                            disabled={summary.ready === 0 || stage === 'importing'}
                        >
                            Import {summary.ready} {plural(summary.ready, 'item', 'items')}
                        </button>
                        <button type="button" className={secondaryButton} onClick={reset}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {stage === 'done' && result && (
                <div className="space-y-3 rounded-xl bg-green-50 p-4" data-testid="import-done">
                    <p className="font-semibold text-green-800">Import finished</p>
                    <p className="text-sm text-green-900">
                        {result.variantsCreated} {plural(result.variantsCreated, 'item', 'items')} added
                        ({result.productsCreated} new {plural(result.productsCreated, 'product', 'products')}
                        {result.addedToExisting > 0 && `, ${result.addedToExisting} existing ${plural(result.addedToExisting, 'product', 'products')} got new sizes`}
                        ). {result.barcodesGenerated} {plural(result.barcodesGenerated, 'barcode was', 'barcodes were')} created.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Link to="/labels" className={primaryButton}>
                            Print barcode labels
                        </Link>
                        <Link to="/products" className={secondaryButton}>
                            View products
                        </Link>
                        <button type="button" className={secondaryButton} onClick={reset}>
                            Import another file
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}