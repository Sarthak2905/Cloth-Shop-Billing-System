import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { clearDb, makeItem } from '../test-utils/correctionFixtures'
import BillingPage from './BillingPage'

beforeEach(clearDb)

function renderBilling() {
    return render(
        <MemoryRouter>
            <BillingPage />
        </MemoryRouter>,
    )
}
async function scan(barcode) {
    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: barcode } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to bill' }))
    await screen.findByText(/^Added /)
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save & print bill/ }))
const total = () => screen.getByTestId('bill-total')

async function twoPieceBill() {
    await makeItem({ name: 'Shirt', price: 51000, barcode: 'BC-0001', sku: 'A' })
    renderBilling()
    await scan('BC-0001')
    fireEvent.click(screen.getByLabelText('Increase quantity'))
}

test('the newest item is shown first and highlighted', async () => {
    await makeItem({ name: 'Shirt A', barcode: 'BC-0001', sku: 'A' })
    await makeItem({ name: 'Shirt B', barcode: 'BC-0002', sku: 'B' })
    renderBilling()

    await scan('BC-0001')
    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: 'BC-0002' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to bill' }))
    await waitFor(() => expect(screen.getAllByTestId('cart-line')).toHaveLength(2))

    const lines = screen.getAllByTestId('cart-line')
    expect(lines[0]).toHaveTextContent('Shirt B')
    expect(lines[0].className).toContain('border-blue-500')
    expect(lines[1]).toHaveTextContent('Shirt A')
    expect(lines[1].className).not.toContain('border-blue-500')
})

test('the total is always shown, and the 10% and 20% buttons switch on and off', async () => {
    await makeItem({ price: 59900, barcode: 'BC-0001', sku: 'A' })
    renderBilling()
    await scan('BC-0001')
    expect(total()).toHaveTextContent('₹599.00')

    const ten = screen.getByRole('button', { name: '10% off' })
    fireEvent.click(ten)
    expect(ten).toHaveAttribute('aria-pressed', 'true')
    expect(total()).toHaveTextContent('₹539.00')

    fireEvent.click(screen.getByRole('button', { name: '20% off' }))
    expect(total()).toHaveTextContent('₹479.00')
    expect(ten).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: '20% off' }))
    expect(total()).toHaveTextContent('₹599.00')
})

test('an item can be switched out of the discount on this bill', async () => {
    await makeItem({ price: 51000, barcode: 'BC-0001', sku: 'A' })
    renderBilling()
    await scan('BC-0001')

    fireEvent.click(screen.getByRole('button', { name: '10% off' }))
    expect(total()).toHaveTextContent('₹459.00')

    fireEvent.click(screen.getByRole('button', { name: 'No discount' }))
    expect(total()).toHaveTextContent('₹510.00')
})

test('Save & print with nothing typed saves the bill as payment pending and prints it', async () => {
    await twoPieceBill()
    expect(total()).toHaveTextContent('₹1,020.00')

    save()

    const done = await screen.findByTestId('sale-complete')
    expect(done).toHaveTextContent('Payment pending')
    const [sale] = await db.sales.toArray()
    expect(sale).toMatchObject({ paymentStatus: 'pending', totalPaise: 102000 })
    expect((await db.variants.toArray())[0].currentStock).toBe(8)
    await waitFor(async () => expect(await db.printJobs.count()).toBe(1))
    expect(await screen.findByTestId('print-message')).toHaveTextContent('Simulated print only')
    expect(screen.queryAllByTestId('cart-line')).toHaveLength(0)
})

test('Save without printing does not print', async () => {
    await twoPieceBill()

    fireEvent.click(screen.getByRole('button', { name: 'Save without printing' }))

    await screen.findByTestId('sale-complete')
    expect(await db.sales.count()).toBe(1)
    expect(await db.printJobs.count()).toBe(0)
})

test('half cash and half UPI is saved as a split payment', async () => {
    await twoPieceBill()

    type('Cash', '500')
    type('UPI', '520')
    expect(screen.getByTestId('pay-status')).toHaveTextContent('Received ₹1,020.00 · Exact')
    save()

    await screen.findByTestId('sale-complete')
    const [sale] = await db.sales.toArray()
    expect(sale).toMatchObject({ paymentStatus: 'paid', receivedPaise: 102000, shortPaise: 0 })
    expect(sale.payment.method).toBe('split')
})

test('a bargain: ₹1,000 for a ₹1,020 bill is accepted and the short amount is shown', async () => {
    await twoPieceBill()

    type('Cash', '1000')
    expect(screen.getByTestId('pay-status')).toHaveTextContent('Short ₹20.00')
    save()

    const done = await screen.findByTestId('sale-complete')
    expect(done).toHaveTextContent('Short ₹20.00')
    expect((await db.sales.toArray())[0]).toMatchObject({ receivedPaise: 100000, shortPaise: 2000 })
})

test('a wrong amount is explained and nothing is saved', async () => {
    await twoPieceBill()

    type('Cash', 'abc')

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Enter the Cash amount')
    expect(screen.getByRole('button', { name: /Save & print bill/ })).toBeDisabled()
    expect(await db.sales.count()).toBe(0)
})

test('F9 saves and prints, and F2 moves to the barcode box', async () => {
    await twoPieceBill()

    screen.getByLabelText('Search items').focus()
    fireEvent.keyDown(window, { key: 'F2' })
    expect(screen.getByLabelText('Barcode')).toHaveFocus()

    fireEvent.keyDown(window, { key: 'F9' })

    await screen.findByTestId('sale-complete')
    expect(await db.sales.count()).toBe(1)
    await waitFor(async () => expect(await db.printJobs.count()).toBe(1))
})

test('an empty bill cannot be saved', async () => {
    await makeItem({ barcode: 'BC-0001', sku: 'A' })
    renderBilling()

    expect(screen.getByRole('button', { name: /Save & print bill/ })).toBeDisabled()
    fireEvent.keyDown(window, { key: 'F9' })
    expect(await db.sales.count()).toBe(0)
})

test('bills waiting for payment are counted, and the payment can be recorded from the saved card', async () => {
    await twoPieceBill()
    save()
    await screen.findByTestId('sale-complete')

    expect(await screen.findByText(/1 bill waiting for payment/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const panel = screen.getByTestId('payment-record-panel')
    fireEvent.change(within(panel).getByLabelText('Cash'), { target: { value: '1020' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save payment' }))

    await within(panel).findByText('Payment recorded')
    expect((await db.sales.toArray())[0].paymentStatus).toBe('paid')
    await waitFor(() => expect(screen.queryByText(/waiting for payment/)).not.toBeInTheDocument())
})

test('the next bill starts clean after saving', async () => {
    await twoPieceBill()
    type('Cash', '500')
    save()
    await screen.findByTestId('sale-complete')

    expect(screen.getByLabelText('Cash', { selector: '#pay-cash' })).toHaveValue('')
    expect(total()).toHaveTextContent('₹0.00')
})