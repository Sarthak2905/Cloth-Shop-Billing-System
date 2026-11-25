// One number with a small label. Use it inside a <dl>.
export default function StatTile({ label, value, tone = 'default' }) {
    const color = tone === 'warn' ? 'text-amber-700' : 'text-slate-900'
    return (
        <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className={`mt-1 text-xl font-bold ${color}`}>{value}</dd>
        </div>
    )
}