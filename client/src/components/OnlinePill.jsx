import { useOnlineStatus } from '../pwa/usePwa'

export default function OnlinePill() {
    const online = useOnlineStatus()

    return (
        <span
            data-testid="online-pill"
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${online ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
        >
            {online ? 'Online' : 'Offline'}
        </span>
    )
}