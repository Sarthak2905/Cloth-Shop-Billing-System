import { useOnlineStatus, usePwa } from '../pwa/usePwa'

// `register`, `apply` and `enabled` are only passed in by tests.
// `showPill` is false when the Online pill is shown somewhere else (the top bar).
export default function StatusBar({ register, apply, enabled, showPill = true }) {
    const online = useOnlineStatus()
    const { offlineReady, dismissOfflineReady, updateReady, updateNow } = usePwa({
        register,
        apply,
        enabled,
    })

    return (
        <div className="print:hidden">
            {showPill && (
                <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <span
                        data-testid="online-pill"
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${online ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                            }`}
                    >
                        {online ? 'Online' : 'Offline'}
                    </span>
                    {!online && (
                        <span className="text-slate-600">
                            Billing keeps working. Sales are saved on this device.
                        </span>
                    )}
                </div>
            )}

            {!showPill && !online && (
                <div role="status" className="bg-amber-100 px-4 py-1 text-sm text-amber-900">
                    Offline. Billing keeps working and sales are saved on this device.
                </div>
            )}

            {offlineReady && (
                <div role="status" className="bg-green-100 px-4 py-2 text-sm text-green-900">
                    <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
                        <span>Ready to work offline.</span>
                        <button type="button" className="font-medium underline" onClick={dismissOfflineReady}>
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {updateReady && (
                <div role="status" className="bg-blue-100 px-4 py-2 text-sm text-blue-900">
                    <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
                        <span>A new version is ready. Finish the current bill first, then update.</span>
                        <button type="button" className="font-medium underline" onClick={updateNow}>
                            Update now
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}