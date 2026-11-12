import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { formatDateTime } from '../lib/format'
import {
    dismissAttention,
    listAttention,
    retryAllAttention,
    retryAttention,
} from '../sync/attention'
import { CLOCK_WARNING_MS } from '../sync/clock'
import { compareStock } from '../sync/stockCheck'
import { useSync } from '../sync/SyncProvider'

function LoginForm({ signIn }) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setBusy(true)
        try {
            await signIn(username.trim(), password)
            setPassword('')
        } catch (err) {
            setError(err?.message || 'Could not sign in')
        } finally {
            setBusy(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm" noValidate>
            <p className="font-semibold">Sign in to the server</p>
            <p className="text-sm text-slate-600">
                Use the shop owner (admin) account. Billing never needs this. It is only for sending your
                data to the server.
            </p>
            <FormField label="Username" htmlFor="sync-username">
                <input
                    id="sync-username"
                    autoComplete="username"
                    className={inputClass}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
            </FormField>
            <FormField label="Password" htmlFor="sync-password">
                <input
                    id="sync-password"
                    type="password"
                    autoComplete="current-password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </FormField>
            {error && (
                <p role="alert" className="text-sm text-red-600">
                    {error}
                </p>
            )}
            <button type="submit" className={primaryButton} disabled={busy}>
                Sign in
            </button>
        </form>
    )
}

function ClockNotice({ clock }) {
    if (!clock) return null
    if (clock.ok) return <p className="text-sm text-slate-500">Clock check: this device&apos;s time matches the server.</p>

    const minutes = Math.round(Math.abs(clock.skewMs) / 60000)
    const direction = clock.skewMs > 0 ? 'ahead of' : 'behind'
    return (
        <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
            This device&apos;s clock is about {minutes} minutes {direction} the server (limit{' '}
            {CLOCK_WARNING_MS / 60000}). Sales stamped too far in the future are refused. Please correct the
            date and time on this device.
        </p>
    )
}

function AttentionList() {
    const items = useLiveQuery(() => listAttention(), [])
    if (!items || items.length === 0) return null

    return (
        <div className="space-y-2 rounded-xl border-l-4 border-red-500 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Needs attention</p>
                <button type="button" className={secondaryButton} onClick={retryAllAttention}>
                    Retry all
                </button>
            </div>
            <p className="text-sm text-slate-600">
                The server refused these. Nothing was lost: they are still on this device. Fix the cause
                (for example change a duplicate barcode), then retry.
            </p>
            <ul className="space-y-2">
                {items.map((item) => (
                    <li key={item.id} data-testid="attention-item" className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-medium">
                            {item.kind}: {item.label}
                        </p>
                        <p className="text-red-700">{item.message}</p>
                        <p className="text-xs text-slate-500">{item.code}</p>
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                aria-label={`Retry ${item.label}`}
                                className={primaryButton}
                                onClick={() => retryAttention(item)}
                            >
                                Retry
                            </button>
                            <button
                                type="button"
                                aria-label={`Dismiss ${item.label}`}
                                className={secondaryButton}
                                onClick={() => dismissAttention(item.id)}
                            >
                                Dismiss
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function StockCheck({ api, waiting }) {
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    async function handleCheck() {
        setBusy(true)
        setError('')
        try {
            setResult(await compareStock(api))
        } catch (err) {
            setResult(null)
            setError(err?.message || 'The stock could not be compared')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
            <p className="font-semibold">Stock check</p>
            <p className="text-slate-600">Compares the stock on this device with the server, item by item.</p>
            {waiting > 0 && (
                <p className="text-amber-700">
                    {waiting} changes are still waiting to sync, so some differences are expected. Sync first.
                </p>
            )}
            <button type="button" className={secondaryButton} disabled={busy} onClick={handleCheck}>
                Compare stock with server
            </button>
            {error && (
                <p role="alert" className="text-red-600">
                    {error}
                </p>
            )}
            {result && (
                <div data-testid="stock-result" className="space-y-1">
                    <p>{result.checked} items checked.</p>
                    {result.mismatches.length === 0 ? (
                        <p className="text-green-700">Stock matches the server.</p>
                    ) : (
                        <ul className="list-disc pl-5 text-red-700">
                            {result.mismatches.map((m) => (
                                <li key={m.variantId}>
                                    {m.sku}: this device {m.local}, server {m.server === null ? 'does not have it' : m.server}
                                </li>
                            ))}
                        </ul>
                    )}
                    {result.onlyOnServer.length > 0 && (
                        <p className="text-slate-600">{result.onlyOnServer.length} items exist only on the server.</p>
                    )}
                </div>
            )}
        </div>
    )
}

export default function SyncPage() {
    const sync = useSync()
    const { counts } = sync
    const catalogue = counts.products + counts.variants

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Sync with server</h2>

            <div className="space-y-1 rounded-xl bg-white p-4 text-sm shadow-sm">
                <p>Connection: {sync.online ? 'Online' : 'Offline'}</p>
                <p>
                    Signed in:{' '}
                    {sync.signedIn
                        ? `${sync.session.user?.displayName ?? 'Yes'}${sync.session.user?.role ? ` (${sync.session.user.role})` : ''}`
                        : 'No'}
                </p>
                <p>
                    Waiting to sync: {catalogue} catalogue changes, {counts.movements} stock changes,{' '}
                    {counts.sales} sales
                </p>
                <p>Needs attention: {counts.attention}</p>
                <p>
                    Last successful sync:{' '}
                    {sync.lastSuccessAt ? formatDateTime(sync.lastSuccessAt) : 'Never'}
                </p>
                {sync.lastRun && (
                    <p className="text-slate-500">
                        Last attempt: {formatDateTime(sync.lastRun.at)}
                        {sync.lastRun.message ? ` · ${sync.lastRun.message}` : ''}
                    </p>
                )}
                {sync.notice && (
                    <p role="status" className="text-amber-700">
                        {sync.notice}
                    </p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                    <button
                        type="button"
                        className={primaryButton}
                        disabled={!sync.signedIn || sync.syncing}
                        onClick={sync.syncNow}
                    >
                        {sync.syncing ? 'Syncing...' : 'Sync now'}
                    </button>
                    {sync.signedIn && (
                        <button type="button" className={secondaryButton} onClick={sync.signOut}>
                            Sign out
                        </button>
                    )}
                </div>
            </div>

            <ClockNotice clock={sync.clock} />

            {!sync.signedIn && <LoginForm signIn={sync.signIn} />}

            <AttentionList />

            {sync.signedIn && <StockCheck api={sync.api} waiting={counts.total} />}
        </div>
    )
}