import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { createSale } from '../db/saleRepo'
import { newId } from '../lib/id'
import { clearDb, makeItem } from '../test-utils/correctionFixtures'
import SaleDetailPage from './SaleDetailPage'
import SalesPage from './SalesPage'

beforeEach(clearDb)

// One ₹399 shirt, paid in cash.
async function makeSale() {
    const { product, variant } = await makeItem({
        name: 'Cotton Shirt', price: 39900, barcode: 'BC-0001', sku: 'A',
    })
    const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
    const { sale } = await createSale({
        id: newId(),
        cart,
        payments: [{ method: 'cash', amountPaise: 39900 }],
    })
    return { sale, product }
}

test('the sales page lists saved sales with invoice number, total and how it was paid', async () => {
    const { sale } = await makeSale()

    render(
        <MemoryRouter>
            <SalesPage />
        </MemoryRouter>,
    )

    expect(await screen.findByText(sale.invoiceNumber)).toBeInTheDocument()
    // the total shows twice: in the bill row and in the summary line above the list
    expect(screen.getAllByText('₹399.00')).toHaveLength(2)
    expect(screen.getByTestId('sales-summary')).toHaveTextContent('1 bill · Total ₹399.00')
    expect(screen.getByText(/1 items.*Cash/)).toBeInTheDocument()
})

test('the sale detail page shows the item and the payment, and the bill has no payment line', async () => {
    const { sale } = await makeSale()

    render(
        <MemoryRouter initialEntries={[`/sales/${sale.id}`]}>
            <Routes>
                <Route path="/sales/:id" element={<SaleDetailPage />} />
            </Routes>
        </MemoryRouter>,
    )

    // the item is in the list and in the receipt preview
    expect((await screen.findAllByText(/Cotton Shirt/)).length).toBeGreaterThan(0)

    const payment = await screen.findByTestId('payment-records')
    expect(payment).toHaveTextContent('Cash')
    expect(payment).toHaveTextContent('Received: ₹399.00')

    // "Cash" appears once, in the payment box. The customer's bill does not have it.
    expect(screen.getAllByText('Cash')).toHaveLength(1)
})