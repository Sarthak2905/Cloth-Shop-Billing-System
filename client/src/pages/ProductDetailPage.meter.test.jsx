import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { db } from '../db/db'
import { addStockEntries } from '../db/stockEntryRepo'
import ProductDetailPage from './ProductDetailPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

function Probe() {
    const { state } = useLocation()
    return <p>{`unit:${state?.product?.unit}`}</p>
}

async function setup() {
    const { product } = await addStockEntries({
        name: 'Pant Piece', category: 'Fabric', unit: 'meter',
        rows: [
            { size: 'Grey 101', quantity: 2550, costPaise: 30000, sellingPricePaise: 45000 },
            { size: 'Grey 101', quantity: 1000, costPaise: 31000, sellingPricePaise: 46000 },
        ],
    })
    render(
        <MemoryRouter initialEntries={[`/products/${product.id}`]}>
            <Routes>
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route path="/stock/new" element={<Probe />} />
            </Routes>
        </MemoryRouter>,
    )
    await screen.findByText('Pant Piece')
}

test('shows the stock in meters and the prices per meter', async () => {
    await setup()

    const group = screen.getByTestId('size-group')
    expect(group).toHaveTextContent('Total 35.50 m in stock · 2 entries')
    expect(group).toHaveTextContent('25.50 m left')
    expect(group).toHaveTextContent('Selling ₹450.00 / m')
    expect(screen.getByText('Sold by the meter')).toBeInTheDocument()
})

test('adjusting a fabric entry is done in meters', async () => {
    await setup()
    const card = screen.getAllByTestId('entry-card').find((c) => c.textContent.includes('10.00 m left'))

    fireEvent.click(within(card).getByRole('button', { name: 'Adjust stock' }))
    fireEvent.change(within(card).getByLabelText('Change in meters'), { target: { value: '-2.5' } })
    fireEvent.change(within(card).getByLabelText('Reason'), { target: { value: 'Cut by mistake' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(screen.getByTestId('size-group')).toHaveTextContent('Total 33.00 m in stock'))
})

test('Add stock carries the unit, so the form opens in meter mode', async () => {
    await setup()

    fireEvent.click(screen.getByRole('link', { name: 'Add stock' }))

    expect(await screen.findByText('unit:meter')).toBeInTheDocument()
})