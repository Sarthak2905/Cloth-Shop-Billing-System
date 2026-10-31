import { NavLink, Outlet } from 'react-router-dom'
import BackupReminder from './BackupReminder'
import StatusBar from './StatusBar'

const linkClass = ({ isActive }) =>
    `rounded-lg px-3 py-1 text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
    }`

export default function Layout() {
    return (
        <div className="min-h-screen bg-slate-100 print:bg-white">
            <header className="bg-white shadow-sm print:hidden">
                <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-bold">Clothing POS</h1>
                    <nav className="flex flex-wrap justify-end gap-2">
                        <NavLink to="/billing" className={linkClass}>
                            Billing
                        </NavLink>
                        <NavLink to="/sales" className={linkClass}>
                            Sales
                        </NavLink>
                        <NavLink to="/products" className={linkClass}>
                            Products
                        </NavLink>
                        <NavLink to="/labels" className={linkClass}>
                            Labels
                        </NavLink>
                        <NavLink to="/settings" className={linkClass}>
                            Settings
                        </NavLink>
                        <NavLink to="/backup" className={linkClass}>
                            Backup
                        </NavLink>
                        <NavLink to="/storage" className={linkClass}>
                            Storage
                        </NavLink>
                        <NavLink to="/scanner" className={linkClass}>
                            Scanner Test
                        </NavLink>
                    </nav>
                </div>
            </header>
            <StatusBar />
            <BackupReminder />
            <main className="mx-auto max-w-3xl p-4 print:max-w-none print:p-0">
                <Outlet />
            </main>
        </div>
    )
}