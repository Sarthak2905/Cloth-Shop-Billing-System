import { useState, useSyncExternalStore } from 'react'
import { adminLogin, adminLogout, getAdminState, subscribe, touch } from '../owner/ownerApi'
import OwnerDashboardPage from './OwnerDashboardPage'

function AdminLogin() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    async function submit(event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
            await adminLogin(username.trim(), password)
            setPassword('')
        } catch (err) {
            setError(err.message || 'Could not sign in')
        } finally {
            setBusy(false)
        }
    }

    return (
        <form
            onSubmit={submit}
            className="mx-auto max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-sm"
            data-testid="admin-login"
        >
            <h2 className="text-lg font-bold">Admin login</h2>
            <p className="text-sm text-slate-600">Only the owner can open this area.</p>
            <div>
                <label htmlFor="admin-user" className="text-sm font-medium text-slate-700">
                    Admin username
                </label>
                <input
                    id="admin-user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            <div>
                <label htmlFor="admin-pass" className="text-sm font-medium text-slate-700">
                    Admin password
                </label>
                <input
                    id="admin-pass"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            {error && (
                <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
                    {error}
                </p>
            )}
            <button
                type="submit"
                disabled={busy || !username.trim() || !password}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
                {busy ? 'Signing in…' : 'Open admin area'}
            </button>
        </form>
    )
}

export default function AdminAreaPage() {
    const admin = useSyncExternalStore(subscribe, getAdminState)

    if (!admin.token) return <AdminLogin />

    return (
        <div onClick={touch} onKeyDown={touch} className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <span>
                    Admin: <strong>{admin.user?.displayName || admin.user?.username}</strong>
                    <span className="ml-2 text-xs text-slate-500">Logs out after 15 minutes of no use</span>
                </span>
                <button
                    type="button"
                    onClick={adminLogout}
                    className="rounded-lg border border-slate-300 px-3 py-1 font-medium text-slate-700 hover:bg-slate-100"
                >
                    Log out
                </button>
            </div>
            <OwnerDashboardPage />
        </div>
    )
}