import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { primaryButton } from '../components/styles'
import { useOnlineStatus } from '../pwa/usePwa'
import {
    formatBytes,
    getStorageHealth,
    requestPersistence,
    storageWarning,
} from '../pwa/storageHealth'

export default function StoragePage() {
    const online = useOnlineStatus()
    const [health, setHealth] = useState(null)
    const [message, setMessage] = useState('')

    const counts = useLiveQuery(
        async () => ({
            products: await db.products.count(),
            variants: await db.variants.count(),
            sales: await db.sales.count(),
        }),
        [],
    )

    const refresh = useCallback(async () => {
        setHealth(await getStorageHealth())
    }, [])

    useEffect(() => {
        refresh()
    }, [refresh])

    async function protect() {
        const granted = await requestPersistence()
        setMessage(
            granted
                ? 'The browser agreed to keep this data.'
                : 'The browser did not agree. It may still clear data when space runs low, so back up regularly.',
        )
        await refresh()
    }

    const warning = health ? storageWarning(health) : null
    const offlineCache = Boolean(globalThis.navigator?.serviceWorker?.controller)

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold">Offline and storage</h2>

            <div className="space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold">Offline use</p>
                <p>Connection: {online ? 'Online' : 'Offline'}</p>
                <p>
                    Offline cache:{' '}
                    {offlineCache
                        ? 'Active. The app can open without internet.'
                        : 'Not active on this page. It is active only in the built app (npm run preview) or the installed app.'}
                </p>
            </div>

            <div className="space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold">Saved on this device</p>
                {counts ? (
                    <p>
                        {counts.products} products, {counts.variants} variants, {counts.sales} sales
                    </p>
                ) : (
                    <p className="text-slate-500">Loading...</p>
                )}
                <p className="text-slate-500">
                    This is all stored only on this device. If the device is lost or its data is cleared,
                    it is gone unless you have a backup file.
                </p>
            </div>

            <div className="space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold">Device storage</p>
                {health?.supported ? (
                    <p data-testid="storage-used">
                        {formatBytes(health.usageBytes)} used of {formatBytes(health.quotaBytes)} (
                        {health.percentUsed}%)
                    </p>
                ) : (
                    <p className="text-slate-500">{health ? 'Not reported by this browser.' : 'Loading...'}</p>
                )}
                {health?.supported && (
                    <p>Protected from automatic clearing: {health.persisted ? 'Yes' : 'No'}</p>
                )}
                {warning && <p className="text-amber-700">{warning}</p>}

                <button type="button" className={primaryButton} onClick={protect}>
                    Protect this data
                </button>
                {message && <p role="status">{message}</p>}
            </div>
        </div>
    )
}