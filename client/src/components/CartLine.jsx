import { useEffect, useRef, useState } from 'react'
import DiscountEditor from './DiscountEditor'
import { dangerButton, inputClass, secondaryButton } from './styles'
import { formatMeters, formatQuantity, parseLength } from '../lib/quantity'
import { formatINR } from '../lib/money'

const METER_STEP_CM = 50 // "+" and "-" change a length by half a meter
const QUICK_CM = [50, 80, 90, 100, 150, 200, 250] // one-tap lengths
const LARGE_CM = 2000 // 20 m: a bare number this big is probably centimetres

export default function CartLine({
    line,
    totals,
    onQuantity,
    onRemove,
    onDiscount,
    focusRequest,
    onDone,
}) {
    const [showDiscount, setShowDiscount] = useState(false)
    // What is being typed in the length box: { text, applied, forQuantity }.
    // `applied` = the bill is using this length; `forQuantity` = the length it gave.
    const [draft, setDraft] = useState(null)
    const [entryUnit, setEntryUnit] = useState('m') // what a bare number means: m or cm
    const [error, setError] = useState('')
    const inputRef = useRef(null)

    const meter = line.unit === 'meter'
    const step = meter ? METER_STEP_CM : 1
    const lineAmount = totals.grossPaise - totals.lineDiscountPaise

    // The box shows exactly what was typed (2.5 stays 2.5). It goes back to the real,
    // formatted length when the length was changed in another way (quick buttons, + / -,
    // scanning the same fabric again), or when what was typed was not used.
    const showDraft = draft !== null && (!draft.applied || draft.forQuantity === line.quantity)
    const plain = entryUnit === 'cm' ? String(line.quantity) : formatMeters(line.quantity)
    const shown = showDraft ? draft.text : plain

    // When a fabric is just scanned, the cursor jumps into its length box.
    useEffect(() => {
        if (meter && focusRequest?.variantId === line.variantId) {
            inputRef.current?.focus()
            inputRef.current?.select()
        }
    }, [focusRequest, meter, line.variantId])

    function clearInput() {
        setDraft(null)
        setError('')
    }

    function setLength(cm) {
        clearInput()
        onQuantity(cm)
    }

    // Looks at what was typed: { cm } when it can be used, { problem } when it cannot,
    // and { cm, big } for a very long bare number that needs Enter to be accepted.
    function read(text) {
        const cm = parseLength(text, entryUnit)
        if (cm === null) {
            return {
                problem:
                    entryUnit === 'cm'
                        ? 'Enter whole centimetres like 80, or meters like 0.80 m'
                        : 'Enter a length like 2.35, or 80 cm',
            }
        }
        if (cm < 1) return { problem: 'The length must be at least 0.01 m (1 cm)' }

        const bare = !/[a-z]/i.test(text)
        if (entryUnit === 'm' && bare && cm >= LARGE_CM) {
            const typed = text.trim()
            return {
                cm,
                big: `${formatMeters(cm)} m is a very long length. If you meant ${typed} cm, type "${typed} cm". To keep ${formatMeters(cm)} m, press Enter.`,
            }
        }
        return { cm }
    }

    // Gives a length to the bill. Returns false (and shows why) when the bill refuses it,
    // for example when there is not enough stock.
    function send(cm) {
        const failure = onQuantity(cm)
        if (typeof failure === 'string' && failure) {
            setError(failure)
            return false
        }
        setError('')
        return true
    }

    // The length is used as it is typed. No Enter is needed, the text is never changed,
    // and the cursor stays in the box.
    function handleChange(e) {
        const text = e.target.value
        setError('')

        const result = read(text)
        if (result.problem) {
            setDraft({ text, applied: false }) // still typing, or not a length: say nothing yet
            return
        }
        if (result.big) {
            setDraft({ text, applied: false })
            setError(result.big)
            return
        }
        const applied = send(result.cm)
        setDraft({ text, applied, forQuantity: result.cm })
    }

    // Enter is optional: it confirms a very long length, shows what is wrong, or just
    // moves on to the barcode box. It never changes the text in the box.
    function handleKeyDown(e) {
        if (e.key !== 'Enter') return
        e.preventDefault()

        if (draft === null) {
            onDone?.()
            return
        }
        const result = read(draft.text)
        if (result.problem) {
            setError(result.problem)
            return
        }
        if (!(draft.applied && draft.forQuantity === result.cm)) {
            if (!send(result.cm)) return
            setDraft({ text: draft.text, applied: true, forQuantity: result.cm })
        }
        onDone?.()
    }

    // Clicking away from a wrong or refused length goes back to the real length.
    function handleBlur() {
        if (draft !== null && !draft.applied) clearInput()
    }

    return (
        <li data-testid="cart-line" className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex justify-between gap-2">
                <div>
                    <p className="font-semibold">{line.productName}</p>
                    <p className="text-sm text-slate-500">
                        Size {line.size} · {formatINR(line.unitPricePaise)} {meter ? 'per meter' : 'each'}
                    </p>
                    <p className="text-xs text-slate-400">
                        {line.barcode} · Available: {formatQuantity(line.availableStock, line.unit)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="font-semibold">{formatINR(lineAmount)}</p>
                    {totals.lineDiscountPaise > 0 && (
                        <p className="text-xs text-green-700">
                            Discount -{formatINR(totals.lineDiscountPaise)}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    aria-label="Decrease quantity"
                    className={secondaryButton}
                    disabled={line.quantity - step < 1}
                    onClick={() => (meter ? setLength(line.quantity - step) : onQuantity(line.quantity - step))}
                >
                    -
                </button>
                {meter ? (
                    <span className="flex items-center gap-1">
                        <span className="w-24">
                            <input
                                ref={inputRef}
                                aria-label="Length in meters"
                                inputMode="decimal"
                                autoComplete="off"
                                className={`${inputClass} text-center`}
                                value={shown}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                onKeyDown={handleKeyDown}
                            />
                        </span>
                        <select
                            aria-label="Length unit"
                            className="rounded-lg border border-slate-300 bg-white px-2 py-2"
                            value={entryUnit}
                            onChange={(e) => {
                                setEntryUnit(e.target.value)
                                clearInput()
                            }}
                        >
                            <option value="m">m</option>
                            <option value="cm">cm</option>
                        </select>
                    </span>
                ) : (
                    <span data-testid="qty" className="min-w-8 text-center font-semibold">
                        {line.quantity}
                    </span>
                )}
                <button
                    type="button"
                    aria-label="Increase quantity"
                    className={secondaryButton}
                    onClick={() => (meter ? setLength(line.quantity + step) : onQuantity(line.quantity + step))}
                >
                    +
                </button>
                <button type="button" className={secondaryButton} onClick={() => setShowDiscount((s) => !s)}>
                    Discount
                </button>
                <button type="button" className={dangerButton} onClick={onRemove}>
                    Remove
                </button>
            </div>

            {meter && (
                <>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {QUICK_CM.map((cm) => (
                            <button
                                key={cm}
                                type="button"
                                aria-label={`Set length ${formatMeters(cm)} m`}
                                className={`rounded-lg border px-3 py-1 text-sm font-medium ${line.quantity === cm
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                onClick={() => setLength(cm)}
                            >
                                {formatMeters(cm)}
                            </button>
                        ))}
                    </div>
                    <p
                        data-testid="meter-calc"
                        className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold"
                    >
                        {`${formatMeters(line.quantity)} m (${line.quantity} cm) × ${formatINR(line.unitPricePaise)} = ${formatINR(totals.grossPaise)}`}
                    </p>
                </>
            )}

            {error && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                    {error}
                </p>
            )}

            {showDiscount && (
                <DiscountEditor label="Item discount" discount={line.discount} onApply={onDiscount} />
            )}
        </li>
    )
}