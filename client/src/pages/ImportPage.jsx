import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { applyImport } from '../importer/apply'
import { findPreviousImport, fingerprintRows } from '../importer/importLog'
import { planImport } from '../importer/plan'
import { readTable } from '../importer/readTable'
import { buildTemplateCsv, downloadFile } from '../importer/template'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { AppError } from '../lib/errors'
import { setLabelPreset } from '../lib/labelPreset'

const MAX_SHOWN = 100
const plural = (n, one, many) => (n === 1 ? one : many)
const dateOnly = (iso) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export default function ImportPage({ readTableFn = readTable, saveFile = downloadFile }) {
    const navigate = useNavigate()
    const [stage, setStage] = useState('idle') // idle | reading | checked | importing | done
    const [plan, setPlan] = useState(null)
    const [error, setError] = useState('')
    const [result, setResult] = useState(null)
    const [fileKey, setFileKey] = useState(0)
    const [fileInfo, setFileInfo] = useState({ name: '', fingerprint: '' })
    const [previous, setPrevious] = useState(null)
    const [confirmRepeat, setConfirmRepeat] = useState(false)

    function reset() {
        setPlan(null)
        setError('')
        setResult(null)
        setPrevious(null)
        setConfirmRepeat(false)
        setStage('idle')
        setFileKey((k) => k + 1)
    }

    async function handleFile(e) {
        const file = e.target.files?.[0]
        setPlan(null)
        setError('')
        setResult(null)
        setPrevious(null)
        setConfirmRepeat(false)
        if (!file) {
            setStage('idle')
            return
        }
        setStage('reading')
        try {
            const rows = await readTableFn(file)
            const existing = { products: await db.products.toArray() }
            const checked = planImport(rows, existing)
            if (checked.fatal) {
                setError(checked.fatal)
            } else {
                const fingerprint = fingerprintRows(rows)
                setFileInfo({ name: file.name, fingerprint })
                setPrevious(await findPreviousImport(fingerprint))
                setPlan(checked)
            }
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
            setResult(await applyImport(plan, fileInfo))
            setPlan(null)
            setStage('done')
        } catch (err) {
            setError(err instanceof AppError ? err.message : 'The import failed. Nothing was saved.')
            setStage('checked')
        }
    }

    function handlePrintLabels() {
        setLabelPreset(Object.fromEntries(result.entries.map((entry) => [entry.id, entry.stock])))
        navigate('/labels')
    }

    const summary = plan?.summary
    const blockedByRepeat = Boolean(previous) && !confirmRepeat

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Import stock from a file</h2>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">1. Get the sample file</p>
                <p className="text-sm text-slate-600">
                    Every row is its own stock entry with its own barcode. The same product and size can be
                    in many rows. Required columns: <strong>Product Name, Quantity, Selling Price</strong>.
                </p>
                <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => saveFile('product-import-sample.csv', buildTemplateCsv())}
                >
                    Download sample file
                </button>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                    <li>The sample has 5 example rows. Delete them before you add your own stock.</li>
                    <li>Optional columns: Size, Cost, Company, Category, MRP, Tax %, Price Includes Tax, Allow Discount.</li>
                    <li>Empty MRP uses the selling price. Empty Tax % uses 5. Write <strong>No</strong> in Allow Discount for items that never get a discount.</li>
                    <li>Barcodes are made automatically. SKU and Barcode columns are not needed and are ignored.</li>
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
                        {summary.ready} {plural(summary.ready, 'entry', 'entries')} ready to import
                    </p>
                    {summary.ready > 0 && (
                        <p className="text-sm text-slate-600">
                            {summary.pieces} pieces · {summary.newProducts} new {plural(summary.newProducts, 'product', 'products')}
                            {summary.addedToExisting > 0 &&
                                `, and new entries for ${summary.addedToExisting} existing ${plural(summary.addedToExisting, 'product', 'products')}`}
                            .
                        </p>
                    )}
                    {plan.ignoredColumns.length > 0 && (
                        <p className="text-sm text-slate-500">
                            These columns are not used and were ignored: {plan.ignoredColumns.join(', ')}.
                        </p>
                    )}

                    {previous && (
                        <div
                            data-testid="repeat-warning"
                            role="alert"
                            className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                        >
                            <p className="font-semibold">This file was imported before</p>
                            <p>
                                It has the same content as a file imported on {dateOnly(previous.importedAt)} (
                                {previous.entries} {plural(previous.entries, 'entry', 'entries')}, {previous.pieces}{' '}
                                pieces). Importing it again adds all that stock a second time.
                            </p>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={confirmRepeat}
                                    onChange={(e) => setConfirmRepeat(e.target.checked)}
                                />
                                I want to import it again
                            </label>
                        </div>
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
                                Fix these rows and put them in a new file. Uploading the whole file again would add
                                the good rows a second time.
                            </p>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={primaryButton}
                            onClick={handleImport}
                            disabled={summary.ready === 0 || stage === 'importing' || blockedByRepeat}
                        >
                            Import {summary.ready} {plural(summary.ready, 'entry', 'entries')}
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
                        {result.entriesCreated} {plural(result.entriesCreated, 'entry', 'entries')} added (
                        {result.productsCreated} new {plural(result.productsCreated, 'product', 'products')}
                        {result.addedToExisting > 0 &&
                            `, new entries for ${result.addedToExisting} existing ${plural(result.addedToExisting, 'product', 'products')}`}
                        ). Every entry has its own barcode.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={primaryButton} onClick={handlePrintLabels}>
                            Print labels
                        </button>
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