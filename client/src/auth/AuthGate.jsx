import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { backupFileName, backupToJson, exportBackup, saveTextFile } from '../backup/backupService'
import FormField from '../components/FormField'
import { inputClass, primaryButton, secondaryButton } from '../components/styles'
import { hasVerifier, saveVerifier, verifyOffline } from '../security/passwordVerifier'
import { NetworkError, createApiClient } from '../sync/apiClient'
import { runSync } from '../sync/engine'
import { loadSession, saveSession } from '../sync/session'
import { deviceState, localCounts, serverIsEmpty, wipeDeviceData } from './deviceData'
import { clearUnlock, loadUnlock, saveUnlock } from './unlock'

// Without the gate (tests, small screens) there is nobody to lock.
const AuthContext = createContext({ user: null, lock: () => { } })
export const useAuth = () => useContext(AuthContext)

const PROGRESS_LABEL = {
    products: 'products',
    variants: 'items',
    movements: 'stock records',
    sales: 'bills',
}

function offlineMessage(result) {
    if (result.reason === 'none') {
        return 'The server cannot be reached, and this computer has not signed in before. The first sign-in needs internet. If you are online, the server may be waking up, or it does not allow this website address yet.'
    }
    if (result.reason === 'expired') {
        return 'The offline sign-in on this computer is more than 30 days old. Connect to the internet and sign in again.'
    }
    if (result.reason === 'locked') {
        const minutes = Math.max(1, Math.ceil((result.retryInMs ?? 0) / 60000))
        return `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    }
    if (result.reason === 'unsupported') {
        return 'The server cannot be reached, and this browser cannot check the password without it.'
    }
    return 'The server cannot be reached. The username or password is wrong for signing in without internet.'
}

// What happens right after the app opens, so that nobody has to press anything:
//   no sign-in with the server, or already synced before -> just open (syncing runs by itself)
//   nothing on this computer                              -> download everything
//   data here, server empty                               -> send it (the first sync)
//   data here and on the server                           -> ask once which one is the real data
async function decide(api) {
    const token = loadSession()?.token
    const state = await deviceState()
    if (!token || state.synced) return { phase: 'ready' }
    if (state.empty) return { phase: 'download' }

    let counts = null
    try {
        counts = (await api.pullSummary?.())?.counts ?? null
    } catch {
        counts = null // offline or signed out: open as usual, nothing is sent or changed
    }
    if (!counts) return { phase: 'ready' }
    if (serverIsEmpty(counts)) return { phase: 'upload' }
    return { phase: 'choose', info: { local: await localCounts(), server: counts } }
}

function LoginScreen({ api, onUnlocked }) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const remembered = hasVerifier()

    async function handleSubmit(e) {
        e.preventDefault()
        if (busy) return
        setError('')
        setBusy(true)
        const name = username.trim()
        try {
            try {
                const { token, user } = await api.login(name, password)
                if (user?.role !== 'admin') {
                    setError('This app is for the shop owner (admin) account.')
                    return
                }
                saveSession({ token, user, signedInAt: new Date().toISOString() })
                try {
                    await saveVerifier(user, password)
                } catch {
                    // signing in without internet just will not be available on this computer
                }
                onUnlocked(user)
            } catch (err) {
                if (!(err instanceof NetworkError)) {
                    setError(err?.message || 'Could not sign in')
                    return
                }
                // the server cannot be reached: check the password on this computer instead
                const result = await verifyOffline(name, password)
                if (result.ok) onUnlocked(result.user)
                else setError(offlineMessage(result))
            }
        } finally {
            setPassword('')
            setBusy(false)
        }
    }

    return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
            <form
                onSubmit={handleSubmit}
                noValidate
                className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-sm"
            >
                <h1 className="text-xl font-bold">Clothing POS</h1>
                <p className="text-sm text-slate-600">
                    Sign in with the shop owner account to open your shop data.
                </p>
                <FormField label="Username" htmlFor="login-username">
                    <input
                        id="login-username"
                        autoFocus
                        autoComplete="username"
                        className={inputClass}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </FormField>
                <FormField label="Password" htmlFor="login-password">
                    <input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        className={inputClass}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </FormField>
                {error && (
                    <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                        {error}
                    </p>
                )}
                <button
                    type="submit"
                    className={`${primaryButton} w-full`}
                    disabled={busy || !username.trim() || !password}
                >
                    {busy ? 'Signing in...' : 'Sign in'}
                </button>
                {busy && (
                    <p className="text-xs text-slate-500">
                        The server may be waking up. This can take up to a minute.
                    </p>
                )}
                {remembered && !busy && (
                    <p className="text-xs text-slate-500">
                        This computer can also sign you in without internet.
                    </p>
                )}
            </form>
        </div>
    )
}

// Copies data between this computer and the server, then the app opens. It runs by itself.
function SyncScreen({
    api,
    title,
    intro,
    idleText,
    skipLabel,
    skipNote,
    onDone,
    onSkip,
    onSignInAgain,
}) {
    const [progress, setProgress] = useState(null)
    const [error, setError] = useState(null) // { text, auth }
    const [busy, setBusy] = useState(true)

    const start = useCallback(async () => {
        setBusy(true)
        setError(null)
        setProgress(null)
        try {
            const summary = await runSync({ api, pull: true, forcePull: true, onProgress: setProgress })
            if (summary.outcome === 'ok') {
                onDone()
                return
            }
            const auth = summary.outcome === 'auth'
            setError({
                auth,
                text: auth
                    ? 'Your sign-in is no longer valid. Please sign in again.'
                    : summary.message || 'The data could not be copied.',
            })
        } catch (err) {
            setError({ auth: false, text: err?.message || 'The data could not be copied.' })
        } finally {
            setBusy(false)
        }
    }, [api, onDone])

    useEffect(() => {
        start()
    }, [start])

    return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
            <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-sm">
                <h1 className="text-xl font-bold">{title}</h1>
                <p className="text-sm text-slate-600">{intro}</p>
                {busy && (
                    <p role="status" className="text-sm font-medium text-slate-800">
                        {progress
                            ? `Downloading ${PROGRESS_LABEL[progress.kind] ?? progress.kind}: ${progress.done}${progress.total ? ` of ${progress.total}` : ''
                            }`
                            : idleText}
                    </p>
                )}
                {error && (
                    <>
                        <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                            {error.text}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {error.auth ? (
                                <button type="button" className={primaryButton} onClick={onSignInAgain}>
                                    Sign in again
                                </button>
                            ) : (
                                <button type="button" className={primaryButton} onClick={start}>
                                    Try again
                                </button>
                            )}
                            <button type="button" className={secondaryButton} onClick={onSkip}>
                                {skipLabel}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500">{skipNote}</p>
                    </>
                )}
            </div>
        </div>
    )
}

// Only when this computer has data that never reached the server, and the server has data too.
function ChooseScreen({ info, busy, error, onUseServer, onSendMine }) {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
            <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-sm">
                <h1 className="text-xl font-bold">Which data is the real one?</h1>
                <p className="text-sm text-slate-600">
                    This computer already has data, and the server has data too. This is asked only once.
                </p>
                <ul data-testid="choose-counts" className="list-disc pl-5 text-sm">
                    <li>
                        This computer: {info.local.products} products, {info.local.sales} bills
                    </li>
                    <li>
                        Server: {info.server.products} products, {info.server.sales} bills
                    </li>
                </ul>
                {error && (
                    <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
                        {error}
                    </p>
                )}
                <button type="button" className={`${primaryButton} w-full`} disabled={busy} onClick={onUseServer}>
                    Use the server&apos;s data
                </button>
                <p className="text-xs text-slate-500">
                    A backup file of this computer&apos;s data is saved first, then it is replaced with the server&apos;s
                    data. Choose this if the server has your real shop data.
                </p>
                <button type="button" className={`${secondaryButton} w-full`} disabled={busy} onClick={onSendMine}>
                    Send this computer&apos;s data to the server
                </button>
                <p className="text-xs text-slate-500">
                    Adds this computer&apos;s data to the server&apos;s. Anything that clashes is listed under
                    &quot;Needs attention&quot; on the Sync page.
                </p>
            </div>
        </div>
    )
}

// Wraps the whole app: nothing opens without a sign-in, and data is copied by itself before it
// opens. `api` and `saveFile` can be replaced in tests.
export default function AuthGate({ children, api: apiProp, saveFile = saveTextFile }) {
    const api = useMemo(
        () =>
            apiProp ??
            createApiClient({ getToken: () => loadSession()?.token ?? null, timeoutMs: 60_000 }),
        [apiProp],
    )
    const [user, setUser] = useState(() => loadUnlock())
    const [phase, setPhase] = useState(() => (user ? 'checking' : 'locked'))
    const [info, setInfo] = useState(null)
    const [chooseBusy, setChooseBusy] = useState(false)
    const [chooseError, setChooseError] = useState('')

    useEffect(() => {
        if (phase !== 'checking') return undefined
        let cancelled = false
            ; (async () => {
                const next = await decide(api)
                if (cancelled) return
                if (next.info) setInfo(next.info)
                setPhase(next.phase)
            })()
        return () => {
            cancelled = true
        }
    }, [phase, api])

    const unlock = useCallback((signedIn) => {
        saveUnlock(signedIn)
        setUser(signedIn)
        setPhase('checking')
    }, [])

    const lock = useCallback(() => {
        clearUnlock()
        setUser(null)
        setPhase('locked')
    }, [])

    const open = useCallback(() => setPhase('ready'), [])

    // Keeps a copy of this computer's data as a file, then replaces it with the server's data.
    const replaceWithServer = useCallback(async () => {
        setChooseBusy(true)
        setChooseError('')
        try {
            const backup = await exportBackup()
            saveFile(backupFileName(new Date(), 'before-replace'), backupToJson(backup))
            await wipeDeviceData()
            setPhase('download')
        } catch (err) {
            console.error(err)
            setChooseError('The data could not be replaced. Nothing was changed.')
        } finally {
            setChooseBusy(false)
        }
    }, [saveFile])

    const value = useMemo(() => ({ user, lock }), [user, lock])

    if (phase === 'locked') return <LoginScreen api={api} onUnlocked={unlock} />
    if (phase === 'checking') return <p className="p-6 text-slate-500">Opening...</p>
    if (phase === 'download') {
        return (
            <SyncScreen
                api={api}
                title="Downloading your shop data"
                intro="This computer has no data yet. Your products, stock and bills are being copied from the server. Keep this window open. It can take a few minutes."
                idleText="Connecting to the server..."
                skipLabel="Open the app without data"
                skipNote="Open the app without data only if you will enter the data yourself. Your shop data will not be on this computer."
                onDone={open}
                onSkip={open}
                onSignInAgain={lock}
            />
        )
    }
    if (phase === 'upload') {
        return (
            <SyncScreen
                api={api}
                title="Sending your shop data to the server"
                intro="The server is empty, so your products, stock and bills are being sent to it. After this, every computer you sign in on shows the same data. Keep this window open."
                idleText="Sending your data..."
                skipLabel="Open the app without sending"
                skipNote="Your data stays on this computer, and nothing is lost. It can be sent later from the Sync page."
                onDone={open}
                onSkip={open}
                onSignInAgain={lock}
            />
        )
    }
    if (phase === 'choose' && info) {
        return (
            <ChooseScreen
                info={info}
                busy={chooseBusy}
                error={chooseError}
                onUseServer={replaceWithServer}
                onSendMine={() => setPhase('upload')}
            />
        )
    }
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}