import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import CartLine from './CartLine'

const totals = { grossPaise: 36000, lineDiscountPaise: 0 }

// Keeps the quantity like the real billing page does, and can refuse long lengths.
function Harness({ initial = 80, refuseAbove = Infinity, onChange, onDone, unit = 'meter' }) {
    const [quantity, setQuantity] = useState(initial)
    const line = {
        variantId: 'v1', productName: 'Lining', size: 'Black', barcode: 'FAB-0001',
        unit, unitPricePaise: 45000, availableStock: 2550, quantity, discount: null,
    }
    return (
        <ul>
            <CartLine
                line={line}
                totals={totals}
                onRemove={() => { }}
                onDiscount={() => { }}
                onDone={onDone}
                onQuantity={(q) => {
                    onChange?.(q)
                    if (q > refuseAbove) return 'Only 25.50 m in stock'
                    setQuantity(q)
                    return null
                }}
            />
        </ul>
    )
}

function setup(props = {}) {
    const onChange = vi.fn()
    const onDone = vi.fn()
    render(<Harness onChange={onChange} onDone={onDone} {...props} />)
    return { onChange, onDone }
}
const box = () => screen.getByLabelText('Length in meters')
const type = (value) => fireEvent.change(box(), { target: { value } })
const press = () => fireEvent.keyDown(box(), { key: 'Enter' })

afterEach(() => vi.useRealTimers())

test('the length in meters and centimetres, the price and the amount are on one line', () => {
    setup()

    expect(box()).toHaveValue('0.80')
    expect(screen.getByTestId('meter-calc')).toHaveTextContent('0.80 m (80 cm) × ₹450.00 = ₹360.00')
})

test('the quick buttons set a length with one tap', () => {
    const { onChange } = setup()

    fireEvent.click(screen.getByLabelText('Set length 0.90 m'))
    expect(box()).toHaveValue('0.90')
    fireEvent.click(screen.getByLabelText('Set length 1.00 m'))
    expect(box()).toHaveValue('1.00')

    expect(onChange).toHaveBeenNthCalledWith(1, 90)
    expect(onChange).toHaveBeenNthCalledWith(2, 100)
})

test('a typed length is used at once, without pressing Enter', () => {
    const { onChange, onDone } = setup()

    type('2.25')

    expect(onChange).toHaveBeenLastCalledWith(225)
    expect(screen.getByTestId('meter-calc')).toHaveTextContent('2.25 m (225 cm)')
    expect(onDone).not.toHaveBeenCalled()
})

test('the cursor never leaves the length box by itself, however long the pause', () => {
    vi.useFakeTimers()
    const { onDone } = setup()

    type('2.5')
    act(() => {
        vi.advanceTimersByTime(60000)
    })

    expect(onDone).not.toHaveBeenCalled()
    expect(box()).toHaveValue('2.5')
})

test('Enter moves to the barcode box and the box keeps exactly what was typed', () => {
    const { onDone } = setup()

    type('2.5')
    press()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(box()).toHaveValue('2.5')
})

test('0.1 is 10 cm and 0.01 is 1 cm', () => {
    const { onChange } = setup()

    type('0.1')
    type('0.01')

    expect(onChange).toHaveBeenCalledWith(10)
    expect(onChange).toHaveBeenLastCalledWith(1)
})

test('a length can be typed with "cm"', () => {
    const { onChange } = setup()

    type('80 cm')
    expect(onChange).toHaveBeenLastCalledWith(80)
    type('90cm')
    expect(onChange).toHaveBeenLastCalledWith(90)
    expect(box()).toHaveValue('90cm')
})

test('pressing Enter after typing does not send the length twice, and moves on', () => {
    const { onChange, onDone } = setup()

    type('1.5')
    press()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(150)
    expect(onDone).toHaveBeenCalledTimes(1)
})

test('in cm mode a bare number is centimetres, shown and typed as whole centimetres', () => {
    const { onChange } = setup({ initial: 235 })

    fireEvent.change(screen.getByLabelText('Length unit'), { target: { value: 'cm' } })
    expect(box()).toHaveValue('235')

    type('90')
    expect(onChange).toHaveBeenLastCalledWith(90)

    type('82.5')
    press()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter whole centimetres like 80')
})

test('zero is ignored while typing and explained on Enter: the shortest length is 0.01 m', () => {
    const { onChange } = setup()

    type('0')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    press()
    expect(screen.getByRole('alert')).toHaveTextContent('at least 0.01 m')
    expect(onChange).not.toHaveBeenCalled()
})

test('a wrong length is not used, and Enter explains it', () => {
    const { onChange, onDone } = setup()

    type('2.555')
    expect(onChange).not.toHaveBeenCalled()

    press()
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a length like 2.35')
    expect(onDone).not.toHaveBeenCalled()
})

test('a big number without a unit is not used until Enter confirms it', () => {
    const { onChange, onDone } = setup()

    type('80')
    expect(screen.getByRole('alert')).toHaveTextContent('If you meant 80 cm')
    expect(onChange).not.toHaveBeenCalled()

    press()
    expect(onChange).toHaveBeenCalledWith(8000)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(box()).toHaveValue('80')
})

test('when the bill refuses the length (not enough stock), the reason shows on the line', () => {
    const { onDone } = setup({ refuseAbove: 400 })

    type('5')

    expect(screen.getByRole('alert')).toHaveTextContent('Only 25.50 m in stock')
    expect(onDone).not.toHaveBeenCalled()
})

test('clicking away from a wrong length goes back to the real length', () => {
    setup()

    type('2.555')
    fireEvent.blur(box())

    expect(box()).toHaveValue('0.80')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('clicking away from a length that was used keeps it as typed', () => {
    setup()

    type('0.9')
    fireEvent.blur(box())

    expect(box()).toHaveValue('0.9')
})

test('a length changed another way replaces the typed text', () => {
    setup()

    type('2.5')
    fireEvent.click(screen.getByLabelText('Set length 1.00 m'))

    expect(box()).toHaveValue('1.00')
})

test('a piece line has none of this', () => {
    setup({ unit: 'piece', initial: 2 })

    expect(screen.queryByLabelText('Length unit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('meter-calc')).not.toBeInTheDocument()
    expect(screen.getByTestId('qty')).toHaveTextContent('2')
})