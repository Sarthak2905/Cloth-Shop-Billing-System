import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBackupStatus } from '../backup/backupService'

function ageText(hours) {
    if (hours < 1) return 'less than an hour'
    if (hours < 48) return `${hours} hours`
    return `${Math.floor(hours / 24)} days`
}

// An amber banner shown on every page while the data is not backed up.
export default function BackupReminder() {
    // Re-checks every 5 minutes, so the banner appears even if nothing is being sold.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 5 * 60 * 1000)
        return () => clearInterval(timer)
    }, [])

    const status = useLiveQuery(() => getBackupStatus(new Date(now)), [now])

    if (!status || (status.level !== 'never' && status.level !== 'stale')) return null

    const since = status.salesSince
    const text =
        status.level === 'never'
            ? 'You have not made a backup yet. Your sales are stored only on this device.'
            : `Your last backup was ${ageText(status.hoursSince)} ago${since ? ` (${since} ${since === 1 ? 'sale' : 'sales'} since)` : ''
            }.`

    return (
        <div role="status" className="bg-amber-100 px-4 py-2 text-sm text-amber-900 print:hidden">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
                <span>{text}</span>
                <Link to="/backup" className="font-medium underline">
                    Back up now
                </Link>
            </div>
        </div>
    )
}