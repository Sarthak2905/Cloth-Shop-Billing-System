// A round badge with the first letter of a name.
export default function Avatar({ name, size = 'md' }) {
    const letter = (String(name ?? '').trim()[0] || '?').toUpperCase()
    const sizes = { md: 'h-11 w-11 text-lg', lg: 'h-16 w-16 text-2xl' }
    return (
        <span
            aria-hidden="true"
            className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 ${sizes[size] ?? sizes.md}`}
        >
            {letter}
        </span>
    )
}