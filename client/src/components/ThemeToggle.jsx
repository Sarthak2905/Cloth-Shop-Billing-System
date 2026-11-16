import { useTheme } from '../lib/theme'

export default function ThemeToggle() {
    const { theme, toggle } = useTheme()
    const dark = theme === 'dark'

    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={dark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
            {dark ? '☀️ Light' : '🌙 Dark'}
        </button>
    )
}