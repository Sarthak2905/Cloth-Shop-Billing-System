import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { createSale, getSale } from '../db/saleRepo'
import { newId } from '../lib/id'
import { clearDb, makeItem } from '../test-utils/correctionFixtures'
import SaleDetailPage from './SaleDetailPage'

beforeEach(clearDb)

async function renderSale(payments) {
    const { product, variant } = await makeItem({ price: 51000 })
    let cart = createCart()
    cart = addItem(cart, lineFromVariant(variant, product)).cart
    cart = addItem(cart, lineFromVariant(variant, product)).cart
    const { sale } = await createSale({ id: newId(), cart, payments })
    render(
        <MemoryRouter initialEntries={[`/sales/${sale.id}`]}>
            <Routes>
                <Route path="/sales/:id" element={<SaleDetailPage />} />
            </Routes>
        </MemoryRouter>,
    )
    return sale
}

test('a bill waiting for payment says so and can record the payment', async () => {
    const sale = await renderSale()

    const box = await screen.findByTestId('payment-records')
    expect(box).toHaveTextContent('Payment pending · ₹1,020.00 to receive')
    expect(box).toHaveTextContent('never printed on the customer')

    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    const panel = screen.getByTestId('payment-record-panel')
    fireEvent.change(within(panel).getByLabelText('Cash'), { target: { value: '1000' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save payment' }))

    await within(panel).findByText('Payment recorded')
    expect(await screen.findByText('Received: ₹1,000.00')).toBeInTheDocument()
    expect(screen.getByText('Short: ₹20.00 (accepted)')).toBeInTheDocument()
    expect((await getSale(sale.id)).sale.shortPaise).toBe(2000)
})

test('a split payment is listed line by line', async () => {
    await renderSale([
        { method: 'cash', amountPaise: 50000 },
        { method: 'upi', amountPaise: 52000, reference: 'T9' },
    ])

    const box = await screen.findByTestId('payment-records')
    expect(box).toHaveTextContent('Cash + UPI')
    expect(box).toHaveTextContent('Cash: ₹500.00')
    expect(box).toHaveTextContent('UPI: ₹520.00 (T9)')
    expect(box).toHaveTextContent('Received: ₹1,020.00')
    expect(screen.getByRole('button', { name: 'Change payment' })).toBeInTheDocument()
})

test('the receipt preview shows no payment lines', async () => {
    await renderSale([{ method: 'cash', amountPaise: 102000 }])
    await screen.findByTestId('payment-records')

    expect(screen.queryByText('Received')).not.toBeInTheDocument()
    expect(screen.queryByText('Change')).not.toBeInTheDocument()
})