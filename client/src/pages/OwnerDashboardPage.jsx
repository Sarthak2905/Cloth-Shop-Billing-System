import { useCallback, useEffect, useState } from 'react'
import { fetchOwnerDashboard } from '../owner/ownerApi'
import { change, dayName, rupees } from '../owner/format'

function Tile({ label, value, sub, tone = 'default', testId }) {
    const color =
        tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-900'
    return (
        <div className="rounded-xl bg-white p-4 shadow-sm" data-testid={testId}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
    )
}

function Trend({ now, before, label }) {
    const c = change(now, before)
    if (!c) return <span>{label}</span>
    return (
        <span>
            <span className={c.up ? 'text-emerald-600' : 'text-red-600'}>{c.text}</span> {label}
        </span>
    )
}

export default function OwnerDashboardPage() {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            setData(await fetchOwnerDashboard())
        } catch (err) {
            setError(err.message || 'Could not load the dashboard')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

   

    const maxDay = Math.max(1, ...(data?.last7Days ?? []).map((d) => d.totalPaise))

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">Owner dashboard</h2>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>

            {error && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </p>
            )}

            {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}

            {data && (
                <>
                    {data.stock.noCost.count > 0 && (
                        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="no-cost-warning">
                            <p className="font-medium">
                                {data.stock.noCost.count} items in stock have no cost price, so profit looks higher than it is.
                            </p>
                            <ul className="mt-1 list-disc pl-5 text-xs">
                                {data.stock.noCost.items.map((i) => (
                                    <li key={i.barcode}>
                                        {i.name} {i.size && `· ${i.size}`} · {i.barcode} · stock {i.stock}
                                    </li>
                                ))}
                            </ul>
                            {data.stock.noCost.count > data.stock.noCost.items.length && (
                                <p className="mt-1 text-xs">Showing the first {data.stock.noCost.items.length}.</p>
                            )}
                        </div>
                    )}

                    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Tile
                            testId="today-sales"
                            label="Today's sales"
                            value={rupees(data.today.totalPaise)}
                            sub={
                                <>
                                    {data.today.bills} bills ·{' '}
                                    <Trend now={data.today.totalPaise} before={data.yesterday.totalPaise} label="vs yesterday" />
                                </>
                            }
                        />
                        <Tile
                            testId="today-profit"
                            label="Today's profit"
                            value={rupees(data.today.profitPaise)}
                            tone={data.today.profitPaise < 0 ? 'bad' : 'good'}
                            sub="Before expenses, GST left out"
                        />
                        <Tile
                            testId="month-sales"
                            label="This month's sales"
                            value={rupees(data.month.totalPaise)}
                            sub={
                                <>
                                    {data.month.bills} bills ·{' '}
                                    <Trend now={data.month.totalPaise} before={data.lastMonth.totalPaise} label="vs last month" />
                                </>
                            }
                        />
                        <Tile
                            testId="month-profit"
                            label="This month's profit"
                            value={rupees(data.month.profitPaise)}
                            tone={data.month.profitPaise < 0 ? 'bad' : 'good'}
                            sub="Before expenses, GST left out"
                        />
                    </section>

                    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Tile
                            testId="stock-value"
                            label="Stock value (cost)"
                            value={rupees(data.stock.totalCostValuePaise)}
                            sub={`At selling price ${rupees(data.stock.totalSellValuePaise)}`}
                        />
                        <Tile
                            label="Items in stock"
                            value={data.stock.totalPieces.toLocaleString('en-IN')}
                            sub={`${data.stock.lowStockCount} running low`}
                        />
                        <Tile
                            testId="customer-dues"
                            label="Customers owe you"
                            value={rupees(data.customerDues.totalPaise)}
                            tone={data.customerDues.totalPaise > 0 ? 'bad' : 'default'}
                            sub={`${data.customerDues.count} pending bills`}
                        />
                        <Tile
                            label="Last month's profit"
                            value={rupees(data.lastMonth.profitPaise)}
                            sub={`Sales ${rupees(data.lastMonth.totalPaise)}`}
                        />
                    </section>

                    <section className="rounded-xl bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700">Last 7 days</h3>
                        <div className="mt-3 flex h-32 items-end gap-2">
                            {data.last7Days.map((d) => (
                                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                                    <span className="text-[10px] text-slate-500">{d.totalPaise ? rupees(d.totalPaise) : ''}</span>
                                    <div
                                        className="w-full rounded-t bg-emerald-500"
                                        style={{ height: `${Math.max(2, (d.totalPaise / maxDay) * 80)}px` }}
                                    />
                                    <span className="text-xs text-slate-600">{dayName(d.date)}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700">Stock by category</h3>
                        {data.stock.byCategory.length === 0 ? (
                            <p className="mt-2 text-sm text-slate-500">No stock yet.</p>
                        ) : (
                            <div className="mt-2 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-slate-500">
                                            <th className="py-1 pr-2 font-medium">Category</th>
                                            <th className="py-1 pr-2 text-right font-medium">Items</th>
                                            <th className="py-1 pr-2 text-right font-medium">Cost value</th>
                                            <th className="py-1 text-right font-medium">Low</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.stock.byCategory.map((c) => (
                                            <tr key={c.category} className="border-t border-slate-100">
                                                <td className="py-1.5 pr-2">{c.category}</td>
                                                <td className="py-1.5 pr-2 text-right">{c.pieces.toLocaleString('en-IN')}</td>
                                                <td className="py-1.5 pr-2 text-right">{rupees(c.costValuePaise)}</td>
                                                <td className={`py-1.5 text-right ${c.lowStock ? 'font-medium text-red-600' : ''}`}>
                                                    {c.lowStock}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <p className="text-xs text-slate-500">
                        Updated {new Date(data.generatedAt).toLocaleTimeString('en-IN')}. Cancelled bills are not counted.
                        Expenses, supplier dues and cash come in the next phases.
                    </p>
                </>
            )}
        </div>
    )
}