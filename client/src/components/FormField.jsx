export default function FormField({ label, htmlFor, error, hint, children }) {
    return (
        <div>
            <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
                {label}
            </label>
            <div className="mt-1">{children}</div>
            {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>
    )
}