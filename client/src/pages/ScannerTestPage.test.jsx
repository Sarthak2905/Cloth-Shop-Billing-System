import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import ScannerTestPage from './ScannerTestPage'

function renderPage() {
    return render(
        <MemoryRouter>
            <ScannerTestPage />
        </MemoryRouter>,
    )
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await seedSampleData()
})

test('typing a known barcode shows the product', async () => {
    const variant = (await db.variants.toArray())[0]
    const product = await db.products.get(variant.productId)
    renderPage()

    fireEvent.change(screen.getByLabelText('Barcode'), {
        target: { value: variant.barcode },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }))

    expect(await screen.findByText('Item found')).toBeInTheDocument()
    expect(screen.getByText(product.name)).toBeInTheDocument()
})

test('typing an unknown barcode shows not found', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Barcode'), {
        target: { value: 'CLO999999' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }))

    expect(
        await screen.findByText('No product found for barcode CLO999999'),
    ).toBeInTheDocument()
})

test('the keyboard scan simulator finds the selected item', async () => {
    renderPage()
    const button = screen.getByRole('button', { name: 'Simulate keyboard scan' })
    await waitFor(() => expect(button).toBeEnabled())

    fireEvent.click(button)

    expect(await screen.findByText('Item found')).toBeInTheDocument()
})

test('starting the camera without camera support explains why', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Start camera' }))

    expect(await screen.findByText(/needs HTTPS or localhost/)).toBeInTheDocument()
})