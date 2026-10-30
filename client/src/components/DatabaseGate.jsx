import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { describeDatabaseError } from '../lib/storageErrors'
import { primaryButton } from './styles'

// Shows the app only once the local database really works. If it cannot open,
// it explains what to do instead of showing a broken app.
export default function DatabaseGate({ children }) {
    const [state, setState] = useState({ status: 'loading', message: '' })
    const [attempt, setAttempt] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function check() {
            try {
                await db.open()
                await db.settings.count() // a real read proves the database works
                if (!cancelled) setState({ status: 'ready', message: '' })
            } catch (err) {
                console.error('The local database could not be opened', err)
                if (!cancelled) setState({ status: 'error', message: describeDatabaseError(err) })
            }
        }

        check()
        return () => {
            cancelled = true
        }
    }, [attempt])

    function retry() {
        setState({ status: 'loading', message: '' })
        setAttempt((n) => n + 1)
    }

    if (state.status === 'loading') {
        return <p className="p-6 text-slate-500">Starting...</p>
    }

    if (state.status === 'error') {
        return (
            <div className="mx-auto max-w-lg space-y-3 p-6">
                <h1 className="text-xl font-bold text-red-700">Local storage problem</h1>
                <p>{state.message}</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    <li>Close other tabs or windows of this app.</li>
                    <li>Free up space on the device.</li>
                    <li>
                        Do <strong>not</strong> clear the browser data. That would delete your saved sales
                        unless you have a backup file.
                    </li>
                    <li>Press &ldquo;Try again&rdquo;.</li>
                </ol>
                <button type="button" className={primaryButton} onClick={retry}>
                    Try again
                </button>
            </div>
        )
    }

    return children
}