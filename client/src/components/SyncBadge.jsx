import { Link } from 'react-router-dom'
import { useSync } from '../sync/SyncProvider'

const TONES = {
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
    gray: 'bg-slate-200 text-slate-700',
    green: 'bg-green-100 text-green-800',
}

function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// A small badge on every page that always tells the truth about syncing.
export default function SyncBadge() {
    const { signedIn, online, syncing, counts, lastSuccessAt } = useSync()

    let tone
    let text
    if (counts.attention > 0) {
        tone = 'red'
        text = `Needs attention (${counts.attention})`
    } else if (syncing) {
        tone = 'blue'
        text = 'Syncing...'
    } else if (counts.total > 0) {
        tone = 'amber'
        const why = !signedIn ? ' · sign in' : !online ? ' · offline' : ''
        text = `${counts.total} waiting to sync${why}`
    } else if (!signedIn) {
        tone = 'gray'
        text = 'Not synced to server'
    } else {
        tone = 'green'
        text = lastSuccessAt ? `All synced · ${formatTime(lastSuccessAt)}` : 'All synced'
    }

    return (
        <Link
            to="/sync"
            data-testid="sync-badge"
            className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${TONES[tone]}`}
        >
            {text}
        </Link>
    )
}