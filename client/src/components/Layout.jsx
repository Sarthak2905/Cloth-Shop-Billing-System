import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthGate'
import SyncProvider from '../sync/SyncProvider'
import BackupReminder from './BackupReminder'
import OnlinePill from './OnlinePill'
import StatusBar from './StatusBar'
import SyncBadge from './SyncBadge'
import ThemeToggle from './ThemeToggle'

const linkClass = ({ isActive }) =>
    `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
    }`

const LINKS = [
    ['/billing', 'Billing'],
    ['/sales', 'Sales'],
    ['/customers', 'Customers'],
    ['/products', 'Products'],
    ['/labels', 'Labels'],
    ['/settings', 'Settings'],
    ['/sync', 'Sync'],
    ['/backup', 'Backup'],
    ['/storage', 'Storage'],
    ['/scanner', 'Scanner Test'],
]

function LayoutBody() {
    const { pathname } = useLocation()
    const auth = useAuth()
    // The billing screen uses the whole window and never scrolls the page on a laptop.
    const wide = pathname.startsWith('/billing')

    return (
        <div className="flex h-dvh flex-col bg-slate-100 print:block print:h-auto print:bg-white">
            <header className="shrink-0 border-b border-slate-200 bg-white print:hidden">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <h1 className="shrink-0 text-base font-bold">Clothing POS</h1>
                    <nav className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:w-auto md:min-w-0 md:flex-1">
                        {LINKS.map(([to, label]) => (
                            <NavLink key={to} to={to} className={linkClass}>
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
                        <NavLink
                            to="/owner"
                            className={({ isActive }) =>
                                `rounded-lg border px-3 py-1.5 text-sm font-medium ${isActive
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`
                            }
                        >
                            Admin
                        </NavLink>
                        <OnlinePill />
                        <SyncBadge />
                        <ThemeToggle />
                        {auth.user && (
                            <button
                                type="button"
                                onClick={auth.lock}
                                title={`Signed in as ${auth.user.displayName || auth.user.username}. Lock the app.`}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                            >
                                Lock
                            </button>
                        )}
                    </div>
                </div>
            </header>
            <StatusBar showPill={false} />
            <BackupReminder />
            <main
                className={`min-h-0 flex-1 print:overflow-visible print:p-0 ${wide ? 'overflow-y-auto p-2 lg:overflow-hidden lg:p-3' : 'overflow-y-auto'
                    }`}
            >
                {wide ? (
                    <Outlet />
                ) : (
                    <div className="mx-auto max-w-5xl p-4 print:max-w-none print:p-0">
                        <Outlet />
                    </div>
                )}
            </main>
        </div>
    )
}

export default function Layout() {
    return (
        <SyncProvider>
            <LayoutBody />
        </SyncProvider>
    )
}