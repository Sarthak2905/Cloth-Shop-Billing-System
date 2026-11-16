import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import { readLabelPreset } from '../lib/labelPreset'
import AddStockPage from './AddStockPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    sessionStorage.clear()
})

function renderPage(state) {
    return render(
        <MemoryRouter initialEntries={[{ pathname: '/stock/new', state }]}>
            <Routes>
                <Route path="/stock/new" element={<AddStockPage />} />
                <Route path="/labels" element={<p>Labels page</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

const type = (label, value) =>
    fireEvent.change(screen.getAllByLabelText(label)[0], { target: { value } })
const chooseMeter = () => fireEvent.change(screen.getByLabelText('Sold by'), { target: { value: 'meter' } })
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save stock' }))

function fillFabricRow(quantity = '25.5') {
    type('Design / shade (optional)', 'Grey 101')
    type('Quantity (meters)', quantity)
    type('Cost (₹ per meter)', '300')
    type('Selling price (₹ per meter)', '450')
}

test('fabric is entered in meters with prices per meter, and saved as centimetres', async () => {
    renderPage()
    type('Product name', 'Pant Piece')
    chooseMeter()
    fillFabricRow()
    save()

    expect(await screen.findByTestId('stock-saved')).toHaveTextContent('25.50 m')
    const [entry] = await db.variants.toArray()
    expect(entry).toMatchObject({
        unit: 'meter', size: 'Grey 101', currentStock: 2550,
        costPaise: 30000, sellingPricePaise: 45000, reorderThreshold: 300,
    })
})

test('a wrong length is explained and nothing is saved', async () => {
    renderPage()
    type('Product name', 'Pant Piece')
    chooseMeter()
    fillFabricRow('2.555')
    save()

    expect(await screen.findByText('Enter meters like 25 or 25.5')).toBeInTheDocument()
    expect(await db.variants.count()).toBe(0)
})

test('a garment and a fabric with the same name become two products', async () => {
    renderPage()
    type('Product name', 'Cloth')
    type('Size', 'M')
    type('Quantity', '5')
    type('Selling price (₹)', '299')
    save()
    await screen.findByTestId('stock-saved')

    fireEvent.click(screen.getByRole('button', { name: 'Add more stock' }))
    type('Product name', 'Cloth')
    chooseMeter()
    fillFabricRow()
    save()
    await screen.findByTestId('stock-saved')

    expect(await db.products.count()).toBe(2)
    expect(await db.variants.count()).toBe(2)
})

test('Print labels for fabric gives one label for each roll, not one for each meter', async () => {
    renderPage()
    type('Product name', 'Pant Piece')
    chooseMeter()
    fillFabricRow()
    save()

    fireEvent.click(await screen.findByRole('button', { name: 'Print labels' }))

    expect(await screen.findByText('Labels page')).toBeInTheDocument()
    expect(Object.values(readLabelPreset())).toEqual([1])
})

test('opened from the page of a fabric, it starts in meter mode', () => {
    renderPage({ product: { name: 'Pant Piece', category: 'Fabric', brand: '', unit: 'meter' } })

    expect(screen.getByLabelText('Sold by')).toHaveValue('meter')
    expect(screen.getByLabelText('Quantity (meters)')).toBeInTheDocument()
})