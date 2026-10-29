import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import ProductsPage from './ProductsPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

test('lists products and filters them when searching', async () => {
    await seedSampleData()
    render(
        <MemoryRouter>
            <ProductsPage />
        </MemoryRouter>,
    )

    expect(await screen.findByText('Cotton Shirt')).toBeInTheDocument()
    expect(screen.getByText('Denim Jeans')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search products'), {
        target: { value: 'jeans' },
    })

    await waitFor(() =>
        expect(screen.queryByText('Cotton Shirt')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Denim Jeans')).toBeInTheDocument()
})