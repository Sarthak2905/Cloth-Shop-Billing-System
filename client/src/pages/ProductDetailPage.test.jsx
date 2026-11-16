import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import { addStockEntries } from '../db/stockEntryRepo'
import ProductDetailPage from './ProductDetailPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})
afterEach(() => vi.restoreAllMocks())

const SHIRT = { name: 'Cotton Shirt', category: 'Shirts', brand: 'Hero' }

function renderAt(path) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route path="/products" element={<p>Products list</p>} />
                <Route path="/stock/new" element={<p>Add stock page</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

async function setup() {
    const { product } = await addStockEntries({
        ...SHIRT,
        rows: [
            { size: 'M', quantity: 10, costPaise: 32000, sellingPricePaise: 59900 },
            { size: 'M', quantity: 5, costPaise: 33000, sellingPricePaise: 62900 },
            { size: 'L', quantity: 7, costPaise: 32000, sellingPricePaise: 59900 },
        ],
    })
    renderAt(`/products/${product.id}`)
    await screen.findByText('Cotton Shirt')
    return product
}

const groupFor = (text) => screen.getAllByTestId('size-group').find((g) => g.textContent.includes(text))
const newestMCard = () => within(groupFor('Size M')).getAllByTestId('entry-card')[0]

test('shows the total stock for each size, with every entry under it', async () => {
    await setup()

    const m = groupFor('Size M')
    expect(m).toHaveTextContent('Total 15 in stock')
    expect(within(m).getAllByTestId('entry-card')).toHaveLength(2)
    expect(groupFor('Size L')).toHaveTextContent('Total 7 in stock')
})

test('an entry without a size is shown as "No size"', async () => {
    await setup()
    await addStockEntries({ ...SHIRT, rows: [{ size: '', quantity: 3, sellingPricePaise: 29900 }] })

    expect(await screen.findByText('No size')).toBeInTheDocument()
})

test('adjusting the stock of one entry changes only that entry', async () => {
    await setup()
    const card = newestMCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Adjust stock' }))
    fireEvent.change(within(card).getByLabelText('Quantity change'), { target: { value: '-2' } })
    fireEvent.change(within(card).getByLabelText('Reason'), { target: { value: 'Damaged' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(groupFor('Size M')).toHaveTextContent('Total 13 in stock'))
    expect(groupFor('Size L')).toHaveTextContent('Total 7 in stock')
})

test('an entry can be edited, and the selling price may be above the MRP', async () => {
    await setup()
    const card = newestMCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(card).getByLabelText('Selling price (₹)'), { target: { value: '650' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Save changes' }))

    await waitFor(async () =>
        expect((await db.variants.toArray()).some((v) => v.sellingPricePaise === 65000)).toBe(true),
    )
    expect(await screen.findByText(/Selling ₹650.00/)).toBeInTheDocument()
})

test('a wrong amount in the edit form is explained', async () => {
    await setup()
    const card = newestMCard()

    fireEvent.click(within(card).getByRole('button', { name: 'Edit' }))
    fireEvent.change(within(card).getByLabelText('Selling price (₹)'), { target: { value: 'abc' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Save changes' }))

    expect(await within(card).findByText('Enter the selling price like 599 or 599.50')).toBeInTheDocument()
})

test('archiving an entry takes it out of the total', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await setup()

    fireEvent.click(within(newestMCard()).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(groupFor('Size M')).toHaveTextContent('Total 10 in stock'))
    expect(within(groupFor('Size M')).getByText('Archived')).toBeInTheDocument()
})

test('Add stock carries the product to the Add stock screen', async () => {
    await setup()

    fireEvent.click(screen.getByRole('link', { name: 'Add stock' }))

    expect(await screen.findByText('Add stock page')).toBeInTheDocument()
})

test('archiving the product returns to the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const product = await setup()

    fireEvent.click(screen.getByRole('button', { name: 'Archive product' }))

    expect(await screen.findByText('Products list')).toBeInTheDocument()
    expect((await db.products.get(product.id)).status).toBe('archived')
})

test('an unknown product says so', async () => {
    renderAt('/products/missing')

    expect(await screen.findByText('Product not found.')).toBeInTheDocument()
})