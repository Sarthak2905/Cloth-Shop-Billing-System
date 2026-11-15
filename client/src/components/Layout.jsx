import { NavLink, Outlet } from 'react-router-dom'
import SyncProvider from '../sync/SyncProvider'
import BackupReminder from './BackupReminder'
import StatusBar from './StatusBar'
import SyncBadge from './SyncBadge'

const linkClass = ({ isActive }) =>
    `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
    }`

const LINKS = [
    ['/billing', 'Billing'],
    ['/sales', 'Sales'],
    ['/products', 'Products'],
    ['/labels', 'Labels'],
    ['/settings', 'Settings'],
    ['/sync', 'Sync'],
    ['/backup', 'Backup'],
    ['/storage', 'Storage'],
    ['/scanner', 'Scanner Test'],
]

function LayoutBody() {
    return (
        <div className="min-h-screen bg-slate-100 print:bg-white">
            <header className="bg-white shadow-sm print:hidden">
                <div className="mx-auto max-w-3xl px-4 py-3">
                    <h1 className="text-lg font-bold">Clothing POS</h1>
                    <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1">
                        {LINKS.map(([to, label]) => (
                            <NavLink key={to} to={to} className={linkClass}>
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                </div>
            </header>
            <StatusBar />
            <BackupReminder />
            <div className="mx-auto max-w-3xl px-4 pt-2 print:hidden">
                <SyncBadge />
            </div>
            <main className="mx-auto max-w-3xl p-4 print:max-w-none print:p-0">
                <Outlet />
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