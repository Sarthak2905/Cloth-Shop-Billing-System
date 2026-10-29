import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { formatINR } from '../lib/money'
import SalesPage from './SalesPage'
import SaleDetailPage from './SaleDetailPage'

async function saveOneSale() {
    const variant = (await db.variants.toArray())[0]
    const product = await db.products.get(variant.productId)
    const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
    const { sale } = await createSale({ id: 'sale-1', cart, payment: { method: 'cash' } })
    return { sale, product, variant }
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
    render(
        <MemoryRouter initialEntries={[`/sales/${sale.id}`]}>
            <Routes>
                <Route path="/sales/:id" element={<SaleDetailPage />} />
            </Routes>
        </MemoryRouter>,
    )

    expect(await screen.findByText(sale.invoiceNumber)).toBeInTheDocument()
    expect(screen.getByText(product.name)).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
})