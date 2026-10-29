import { NavLink, Outlet } from 'react-router-dom'

const linkClass = ({ isActive }) =>
    `rounded-lg px-3 py-1 text-sm font-medium ${isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200'
    }`

export default function Layout() {
    return (
        <div className="min-h-screen bg-slate-100">
            <header className="bg-white shadow-sm">
                <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
                    <h1 className="text-lg font-bold">Clothing POS</h1>
                    <nav className="flex gap-2">
                        <NavLink to="/products" className={linkClass}>
                            Products
                        </NavLink>
                        <NavLink to="/scanner" className={linkClass}>
                            Scanner Test
                        </NavLink>
                    </nav>
                </div>
            </header>
            <main className="mx-auto max-w-3xl p-4">
                <Outlet />
            </main>
        </div>
    )
}