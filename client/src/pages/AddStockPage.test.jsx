import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import { createProduct } from '../db/productRepo'
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
                <Route path="/products/:id" element={<p>Product page</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

const type = (label, value, index = 0) =>
    fireEvent.change(screen.getAllByLabelText(label)[index], { target: { value } })

function fillFirstRow({ size = 'M', quantity = '10', cost = '320', price = '599' } = {}) {
    type('Size', size)
    type('Quantity', quantity)
    type('Cost (₹)', cost)
    type('Selling price (₹)', price)
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save stock' }))

test('saves a product with two sizes in one go, copying the prices to the new row', async () => {
    renderPage()
    type('Product name', "Men's Shirt")
    fillFirstRow()
    fireEvent.click(screen.getByRole('button', { name: 'Add another size' }))

    expect(screen.getAllByLabelText('Selling price (₹)')[1]).toHaveValue('599')
    type('Size', 'L', 1)
    type('Quantity', '12', 1)
    save()

    expect(await screen.findByTestId('stock-saved')).toHaveTextContent('2 entries added')
    expect(await db.products.count()).toBe(1)
    const variants = await db.variants.toArray()
    expect(variants.map((v) => v.currentStock).sort((a, b) => a - b)).toEqual([10, 12])
    expect(variants.every((v) => v.sellingPricePaise === 59900)).toBe(true)
})

test('the same product and size can be entered again', async () => {
    renderPage()
    type('Product name', "Men's Shirt")
    fillFirstRow()
    save()
    await screen.findByTestId('stock-saved')

    fireEvent.click(screen.getByRole('button', { name: 'Add more stock' }))
    type('Product name', "Men's Shirt")
    fillFirstRow({ quantity: '6' })
    save()
    await screen.findByTestId('stock-saved')

    expect(await db.products.count()).toBe(1)
    const variants = await db.variants.toArray()
    expect(variants).toHaveLength(2)
    expect(new Set(variants.map((v) => v.barcode)).size).toBe(2)
})

test('a missing name, quantity or price is explained and nothing is saved', async () => {
    renderPage()
    type('Size', 'M')
    save()

    expect(await screen.findByText('Enter the product name')).toBeInTheDocument()
    expect(screen.getByText('Enter the number of pieces (1 or more)')).toBeInTheDocument()
    expect(screen.getByText('Enter the selling price like 599 or 599.50')).toBeInTheDocument()
    expect(await db.variants.count()).toBe(0)
})

test('a wrong amount is explained', async () => {
    renderPage()
    type('Product name', 'Shirt')
    fillFirstRow({ price: 'abc' })
    save()

    expect(await screen.findByText('Enter the selling price like 599 or 599.50')).toBeInTheDocument()
    expect(await db.variants.count()).toBe(0)
})

test('a row without a size and quantity is ignored, and a size can be left empty', async () => {
    renderPage()
    type('Product name', 'Scarf')
    type('Quantity', '5')
    type('Selling price (₹)', '299')
    fireEvent.click(screen.getByRole('button', { name: 'Add another size' }))
    save()

    expect(await screen.findByTestId('stock-saved')).toHaveTextContent('1 entry added')
    const variants = await db.variants.toArray()
    expect(variants).toHaveLength(1)
    expect(variants[0].size).toBe('')
})

test('Print labels opens the Labels page with one copy for each piece', async () => {
    renderPage()
    type('Product name', 'Shirt')
    fillFirstRow({ quantity: '3' })
    save()

    fireEvent.click(await screen.findByRole('button', { name: 'Print labels' }))

    expect(await screen.findByText('Labels page')).toBeInTheDocument()
    expect(Object.values(readLabelPreset())).toEqual([3])
})

test('an earlier product name fills its company and category', async () => {
    await createProduct({ name: 'Cotton Shirt', category: 'Shirts', brand: 'Hero' })
    renderPage()
    await waitFor(() => expect(document.querySelectorAll('#product-names option')).toHaveLength(1))

    const name = screen.getByLabelText('Product name')
    fireEvent.change(name, { target: { value: 'cotton shirt' } })
    fireEvent.blur(name)

    expect(screen.getByLabelText('Category (optional)')).toHaveValue('Shirts')
    expect(screen.getByLabelText('Company / brand (optional)')).toHaveValue('Hero')
})

test('opened from a product page, the name, company and category are already filled', () => {
    renderPage({ product: { name: 'Denim Jeans', category: 'Jeans', brand: 'BlueRiver' } })

    expect(screen.getByLabelText('Product name')).toHaveValue('Denim Jeans')
    expect(screen.getByLabelText('Category (optional)')).toHaveValue('Jeans')
    expect(screen.getByLabelText('Company / brand (optional)')).toHaveValue('BlueRiver')
})