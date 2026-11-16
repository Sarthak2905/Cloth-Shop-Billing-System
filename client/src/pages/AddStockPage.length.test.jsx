import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import AddStockPage from './AddStockPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    sessionStorage.clear()
})

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/stock/new']}>
            <Routes>
                <Route path="/stock/new" element={<AddStockPage />} />
            </Routes>
        </MemoryRouter>,
    )
}
const type = (label, value) =>
    fireEvent.change(screen.getAllByLabelText(label)[0], { target: { value } })

async function saveLining(quantity) {
    renderPage()
    type('Product name', 'Lining')
    fireEvent.change(screen.getByLabelText('Sold by'), { target: { value: 'meter' } })
    type('Design / shade (optional)', 'Black')
    type('Quantity (meters)', quantity)
    type('Cost (₹ per meter)', '40')
    type('Selling price (₹ per meter)', '60')
    fireEvent.click(screen.getByRole('button', { name: 'Save stock' }))
    return screen.findByTestId('stock-saved')
}

test('fabric stock can be typed in centimetres', async () => {
    expect(await saveLining('80 cm')).toHaveTextContent('0.80 m')

    const [entry] = await db.variants.toArray()
    expect(entry.currentStock).toBe(80)
})

test('0.8 meters is 80 cm', async () => {
    await saveLining('0.8')

    const [entry] = await db.variants.toArray()
    expect(entry.currentStock).toBe(80)
})