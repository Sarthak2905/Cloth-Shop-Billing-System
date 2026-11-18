import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useOnlineStatus } from '../pwa/usePwa'
import { createApiClient } from './apiClient'
import { backoffMs } from './backoff'
import { checkClock } from './clock'
import { countPending } from './collect'
import { runSync } from './engine'
import { clearSession, isExpired, loadSession, saveSession } from './session'

export const SyncContext = createContext(null)

export function useSync() {
    const value = useContext(SyncContext)
    if (!value) throw new Error('useSync must be used inside SyncProvider')
    return value
}

const EMPTY_COUNTS = {
    products: 0,
    variants: 0,
    movements: 0,
    sales: 0,
    payments: 0,
    cancels: 0,
    total: 0,
    attention: 0,
}

// `api`, `autoSync`, `autoDelayMs`, `intervalMs` and `firstSyncManual` can be replaced in
// tests. With `firstSyncManual` (the default) nothing is sent by itself until the first
// sync has been started by hand and has worked: it is a deliberate step, after a backup.
export default function SyncProvider({
    children,
    api: apiProp,
    autoSync = true,
    autoDelayMs = 2000,
    intervalMs = 60_000,
    firstSyncManual = true,
}) {
    const [session, setSession] = useState(() => loadSession())
    const sessionRef = useRef(session)
    const online = useOnlineStatus()
    const [syncing, setSyncing] = useState(false)
    const [clock, setClock] = useState(null)
    const [notice, setNotice] = useState('')
    const busy = useRef(false)
    const retry = useRef({ attempt: 0, at: 0 })

    const api = useMemo(
        () => apiProp ?? createApiClient({ getToken: () => sessionRef.current?.token ?? null }),
        [apiProp],
    )

    const counts = useLiveQuery(() => countPending(), []) ?? EMPTY_COUNTS
    const lastRun = useLiveQuery(async () => (await db.settings.get('sync.lastRun'))?.value ?? null, [])
    const lastSuccessAt = useLiveQuery(
        async () => (await db.settings.get('sync.lastSuccessAt'))?.value ?? null,
        [],
    )

    const updateSession = useCallback((next) => {
        sessionRef.current = next
        setSession(next)
    }, [])

    const endSession = useCallback(
        (message) => {
            clearSession()
            updateSession(null)
            setNotice(message)
        },
        [updateSession],
    )

    const signedIn = Boolean(session) && !isExpired(session)
    // Automatic syncing starts only after the first sync worked (when it must be manual).
    const autoAllowed = autoSync && (!firstSyncManual || Boolean(lastSuccessAt))

    const run = useCallback(
        async ({ manual = false } = {}) => {
            const current = sessionRef.current
            if (busy.current || !current) return null
            if (isExpired(current)) {
                endSession('Your sign-in has expired. Please sign in again to sync.')
                return null
            }
            if (!manual && Date.now() < retry.current.at) return null

            busy.current = true
            setSyncing(true)
            try {
                let summary
                try {
                    summary = await runSync({ api })
                } catch (err) {
                    console.error('Sync stopped because of a problem on this device', err)
                    summary = { outcome: 'server-error', sent: 0, message: 'Sync stopped because of a problem on this device.' }
                }

                if (summary.outcome === 'ok') {
                    retry.current = { attempt: 0, at: 0 }
                    setNotice('')
                    if (summary.sent > 0 || manual) {
                        try {
                            setClock(await checkClock(api))
                        } catch {
                            // the clock check is optional
                        }
                    }
                } else if (summary.outcome === 'auth') {
                    endSession('Your sign-in is no longer valid. Please sign in again to sync.')
                } else {
                    const attempt = retry.current.attempt + 1
                    retry.current = { attempt, at: Date.now() + backoffMs(attempt) }
                    setNotice(summary.message)
                }
                return summary
            } finally {
                busy.current = false
                setSyncing(false)
            }
        },
        [api, endSession],
    )

    // Sync shortly after something becomes pending, or when we come back online.
    useEffect(() => {
        if (!autoAllowed || !session || !online || counts.total === 0) return undefined
        const timer = setTimeout(() => {
            run()
        }, autoDelayMs)
        return () => clearTimeout(timer)
    }, [autoAllowed, session, online, counts.total, run, autoDelayMs])

    // A safety net: check again every minute (retries wait for their back-off time).
    useEffect(() => {
        if (!autoAllowed || !session) return undefined
        const timer = setInterval(() => {
            run()
        }, intervalMs)
        return () => clearInterval(timer)
    }, [autoAllowed, session, run, intervalMs])

    const signIn = useCallback(
        async (username, password) => {
            const { token, user } = await api.login(username, password)
            const next = { token, user, signedInAt: new Date().toISOString() }
            saveSession(next)
            updateSession(next)
            retry.current = { attempt: 0, at: 0 }
            setNotice('')
            return next
        },
        [api, updateSession],
    )

    const signOut = useCallback(() => {
        clearSession()
        updateSession(null)
        setNotice('')
    }, [updateSession])

    const value = useMemo(
        () => ({
            session,
            signedIn,
            online,
            syncing,
            counts,
            lastRun: lastRun ?? null,
            lastSuccessAt: lastSuccessAt ?? null,
            clock,
            notice,
            api,
            signIn,
            signOut,
            syncNow: () => run({ manual: true }),
        }),
        [session, signedIn, online, syncing, counts, lastRun, lastSuccessAt, clock, notice, api, signIn, signOut, run],
    )

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}