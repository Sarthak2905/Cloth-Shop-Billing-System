import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { formatINR, paiseToRupees } from '../lib/money'
import SalesPage from './SalesPage'
import SaleDetailPage from './SaleDetailPage'

async function saveOneSale() {
    const variant = (await db.variants.toArray())[0]
    const product = await db.products.get(variant.productId)
    const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
    const { sale } = await createSale({ id: 'sale-1', cart, payment: { method: 'cash' } })
    return { sale, product, variant }
}

function renderDetail(saleId) {
    return render(
        <MemoryRouter initialEntries={[`/sales/${saleId}`]}>
            <Routes>
                <Route path="/sales/:id" element={<SaleDetailPage />} />
            </Routes>
        </MemoryRouter>,
    )
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await seedSampleData()
})

test('the sales page lists saved sales with invoice number and total', async () => {
    const { sale } = await saveOneSale()
    render(
        <MemoryRouter>
            <SalesPage />
        </MemoryRouter>,
    )

    expect(await screen.findByText(sale.invoiceNumber)).toBeInTheDocument()
    expect(screen.getByText(formatINR(sale.totalPaise))).toBeInTheDocument()
})

test('the sale detail page shows the item and the payment', async () => {
    const { sale, product } = await saveOneSale()
    renderDetail(sale.id)

    expect(await screen.findByText(sale.invoiceNumber)).toBeInTheDocument()
    expect(screen.getByText(product.name)).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
})

test('the receipt preview shows the invoice number and the total', async () => {
    const { sale } = await saveOneSale()
    renderDetail(sale.id)

    const preview = await screen.findByTestId('receipt-preview')
    expect(preview).toHaveTextContent(sale.invoiceNumber)
    expect(preview).toHaveTextContent(paiseToRupees(sale.totalPaise))
})

test('printing records a job, and printing again is a reprint that creates no new sale', async () => {
    const { sale } = await saveOneSale()
    renderDetail(sale.id)

    fireEvent.click(await screen.findByRole('button', { name: 'Print receipt' }))
    expect(await screen.findByTestId('print-message')).toHaveTextContent('simulated')
    expect(await screen.findAllByTestId('print-job')).toHaveLength(1)

    fireEvent.click(await screen.findByRole('button', { name: 'Reprint receipt' }))
    await waitFor(() => expect(screen.getAllByTestId('print-job')).toHaveLength(2))
    expect(screen.getByTestId('receipt-preview')).toHaveTextContent('DUPLICATE COPY')
    expect(await db.sales.count()).toBe(1)
})

test('a printer problem shows an error and keeps the sale', async () => {
    const { sale } = await saveOneSale()
    renderDetail(sale.id)

    fireEvent.change(await screen.findByLabelText('Simulated printer'), {
        target: { value: 'paper_out' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Print receipt' }))

    expect(await screen.findByTestId('print-message')).toHaveTextContent('out of paper')
    expect(await screen.findByTestId('print-job')).toHaveTextContent('Failed')
    expect(await db.sales.count()).toBe(1)
})