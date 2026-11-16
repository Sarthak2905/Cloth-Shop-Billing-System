import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import PayBox from './PayBox'
import { EMPTY_PAYMENT_FORM } from '../lib/paymentForm'

function Harness({ onSave = vi.fn(), disabled = false, total = 102000 }) {
    const [form, setForm] = useState(EMPTY_PAYMENT_FORM)
    return (
        <PayBox form={form} onForm={setForm} totalPaise={total} saving={false} error="" disabled={disabled} onSave={onSave} />
    )
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

test('with nothing typed it says the bill is saved as payment pending', () => {
    render(<Harness />)

    expect(screen.getByTestId('pay-status')).toHaveTextContent('saved as payment pending')
})

test('the status line follows what is typed: short, change, exact, split', () => {
    render(<Harness />)

    type('Cash', '1000')
    expect(screen.getByTestId('pay-status')).toHaveTextContent('Received ₹1,000.00 · Short ₹20.00')

    type('Cash', '1100')
    expect(screen.getByTestId('pay-status')).toHaveTextContent('Change ₹80.00')

    type('Cash', '500')
    type('UPI', '520')
    expect(screen.getByTestId('pay-status')).toHaveTextContent('Received ₹1,020.00 · Exact')
    expect(screen.getByLabelText('UPI reference (optional)')).toBeInTheDocument()
})

test('"Cash = total" fills the cash box and "Clear" empties everything', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Cash = total' }))
    expect(screen.getByLabelText('Cash')).toHaveValue('1020.00')

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('Cash')).toHaveValue('')
})

test('a wrong amount is explained and the save buttons are blocked', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)

    type('Card', 'abc')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter the Card amount')
    expect(screen.getByRole('button', { name: /Save & print bill/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save without printing' })).toBeDisabled()
})

test('UPI above the bill is explained', () => {
    render(<Harness />)

    type('UPI', '2000')

    expect(screen.getByRole('alert')).toHaveTextContent('Only cash can give change')
})

test('the two buttons say whether to print', () => {
    const onSave = vi.fn()
    render(<Harness onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /Save & print bill/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save without printing' }))

    expect(onSave).toHaveBeenNthCalledWith(1, true)
    expect(onSave).toHaveBeenNthCalledWith(2, false)
})

test('an empty bill cannot be saved', () => {
    render(<Harness disabled />)

    expect(screen.getByRole('button', { name: /Save & print bill/ })).toBeDisabled()
})