import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    backupFileName,
    backupToJson,
    compareWithDevice,
    exportBackup,
    getBackupStatus,
    readFileAsText,
    recordBackup,
    restoreBackup,
    saveTextFile,
    shareTextFile,
    validateBackup,
} from '../backup/backupService'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { AppError } from '../lib/errors'
import { formatDateTime } from '../lib/format'

// `saveFile` and `shareFile` can be replaced in tests.
export default function BackupPage({ saveFile = saveTextFile, shareFile = shareTextFile }) {
    const status = useLiveQuery(() => getBackupStatus(), [])
    const [message, setMessage] = useState(null)
    const [busy, setBusy] = useState(false)
    const [pending, setPending] = useState(null)
    const [fileError, setFileError] = useState('')
    const [confirmed, setConfirmed] = useState(false)
    const [fileKey, setFileKey] = useState(0)

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    async function handleDownload() {
        setBusy(true)
        setMessage(null)
        try {
            const backup = await exportBackup()
            const name = backupFileName()
            saveFile(name, backupToJson(backup))
            await recordBackup(new Date())
            setMessage({
                type: 'ok',
                text: `Backup saved as ${name}. Copy it somewhere other than this device: Google Drive, email to yourself, or a pen drive.`,
            })
        } catch (err) {
            console.error(err)
            setMessage({ type: 'error', text: 'The backup could not be created. Nothing was changed.' })
        } finally {
            setBusy(false)
        }
    }

    async function handleShare() {
        setBusy(true)
        setMessage(null)
        try {
            const backup = await exportBackup()
            const shared = await shareFile(backupFileName(), backupToJson(backup))
            if (shared) {
                await recordBackup(new Date())
                setMessage({ type: 'ok', text: 'Backup shared.' })
            } else {
                setMessage({
                    type: 'error',
                    text: 'Sharing files is not available here. Use "Download backup file" instead.',
                })
            }
        } catch (err) {
            if (err?.name === 'AbortError') {
                setMessage({ type: 'error', text: 'Sharing was cancelled. No backup was recorded.' })
            } else {
                console.error(err)
                setMessage({ type: 'error', text: 'The backup could not be shared.' })
            }
        } finally {
            setBusy(false)
        }
    }

    async function handleFile(e) {
        const file = e.target.files?.[0]
        setPending(null)
        setFileError('')
        setConfirmed(false)
        setMessage(null)
        if (!file) return

        try {
            const text = await readFileAsText(file)
            let parsed
            try {
                parsed = JSON.parse(text)
            } catch {
                setFileError('This file is not a valid backup. It could not be read.')
                return
            }
            const check = validateBackup(parsed)
            if (!check.ok) {
                setFileError(check.error)
                return
            }
            const comparison = await compareWithDevice(parsed)
            setPending({ backup: parsed, summary: check.summary, comparison, fileName: file.name })
        } catch (err) {
            console.error(err)
            setFileError('The file could not be read.')
        }
    }

    async function handleRestore() {
        if (!pending || !confirmed) return
        setBusy(true)
        setMessage(null)
        try {
            // Keep a copy of what is on the device now, in case this is a mistake.
            if (pending.comparison.hasData) {
                const safety = await exportBackup()
                saveFile(backupFileName(new Date(), 'before-restore'), backupToJson(safety))
            }
            await restoreBackup(pending.backup)
            const { counts } = pending.summary
            setMessage({
                type: 'ok',
                text: `Backup restored: ${counts.products} products, ${counts.variants} variants, ${counts.sales} sales.`,
            })
            setPending(null)
            setConfirmed(false)
            setFileKey((k) => k + 1)
        } catch (err) {
            setMessage({
                type: 'error',
                text:
                    err instanceof AppError
                        ? err.message
                        : 'The backup could not be restored. Nothing was changed.',
            })
        } finally {
            setBusy(false)
        }
    }

    const newer = pending?.comparison.salesNewerThanBackup ?? 0

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Backup and restore</h2>

            <div className="space-y-1 rounded-xl bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold">Last backup</p>
                {status === undefined ? (
                    <p className="text-slate-500">Loading...</p>
                ) : (
                    <>
                        <p>{status.lastBackupAt ? formatDateTime(status.lastBackupAt) : 'Never'}</p>
                        <p>
                            {status.salesSince} {status.salesSince === 1 ? 'sale' : 'sales'} since the last
                            backup
                        </p>
                    </>
                )}
            </div>

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">Make a backup</p>
                <p className="text-sm text-slate-600">
                    The file contains all your products, stock and sales, including purchase costs. Keep it
                    private, and keep a copy off this device.
                </p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={primaryButton} disabled={busy} onClick={handleDownload}>
                        Download backup file
                    </button>
                    {canShare && (
                        <button type="button" className={secondaryButton} disabled={busy} onClick={handleShare}>
                            Share backup
                        </button>
                    )}
                </div>
            </div>

            {message && (
                <p
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={`rounded-lg p-3 text-sm ${message.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}
                >
                    {message.text}
                </p>
            )}

            <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
                <p className="font-semibold">Restore from a backup file</p>
                <p className="text-sm text-slate-600">
                    Restoring replaces <strong>everything</strong> on this device with the file, including
                    invoice numbers. Use it for a new or repaired device, or after data loss.
                </p>
                <FormField label="Backup file" htmlFor="backup-file">
                    <input
                        key={fileKey}
                        id="backup-file"
                        type="file"
                        accept=".json,application/json"
                        className={inputClass}
                        onChange={handleFile}
                    />
                </FormField>

                {fileError && (
                    <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                        {fileError}
                    </p>
                )}

                {pending && (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-semibold">File: {pending.fileName}</p>
                        <p>Made on {formatDateTime(pending.summary.createdAt)}</p>
                        <p>
                            The file contains: {pending.summary.counts.products} products,{' '}
                            {pending.summary.counts.variants} variants, {pending.summary.counts.sales} sales
                        </p>
                        <p>
                            This device has now: {pending.comparison.deviceCounts.products} products,{' '}
                            {pending.comparison.deviceCounts.variants} variants,{' '}
                            {pending.comparison.deviceCounts.sales} sales
                        </p>
                        {newer > 0 && (
                            <p role="alert" className="rounded bg-red-100 p-2 text-red-800">
                                This device has {newer} {newer === 1 ? 'sale' : 'sales'} made after this backup.
                                Restoring will remove {newer === 1 ? 'it' : 'them'} from this device. A safety copy
                                of the current data is saved first.
                            </p>
                        )}
                        <label className="flex items-start gap-2">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                            />
                            <span>I understand this replaces all data on this device</span>
                        </label>
                        <button
                            type="button"
                            className={primaryButton}
                            disabled={!confirmed || busy}
                            onClick={handleRestore}
                        >
                            Restore backup
                        </button>
                    </div>
                )}
            </div>

            <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm">
                <p className="font-semibold text-slate-800">A simple routine</p>
                <ul className="list-disc space-y-1 pl-5">
                    <li>Back up at the end of every day.</li>
                    <li>Keep the last 7 files, in at least two places (for example Drive and a pen drive).</li>
                    <li>Once a month, restore a file on a spare browser to prove it works.</li>
                </ul>
            </div>
        </div>
    )
}