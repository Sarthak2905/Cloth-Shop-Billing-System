import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import { readLabelPreset } from '../lib/labelPreset'
import ImportPage from './ImportPage'

const HEAD = ['Product Name', 'Size', 'Quantity', 'Cost', 'Selling Price', 'Unit']
const rows = [
    HEAD,
    ['Pant Piece', 'Grey 101', '25.5', 300, 450, 'Meter'],
    ['Shirt', 'M', 10, 320, 599, 'Piece'],
]

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    sessionStorage.clear()
})

function setup() {
    render(
        <MemoryRouter initialEntries={['/import']}>
            <Routes>
                <Route path="/import" element={<ImportPage readTableFn={vi.fn(async () => rows)} />} />
                <Route path="/labels" element={<p>Labels page</p>} />
            </Routes>
        </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Product file'), {
        target: { files: [new File(['x'], 'stock.xlsx')] },
    })
}

test('the summary shows pieces and meters of fabric separately', async () => {
    setup()

    const summary = await screen.findByTestId('import-summary')
    expect(summary).toHaveTextContent('2 entries ready to import')
    expect(summary).toHaveTextContent('10 pieces')
    expect(summary).toHaveTextContent('25.50 m of fabric')
})

test('Print labels gives one label for each roll of fabric and one for each piece', async () => {
    setup()
    await screen.findByTestId('import-summary')
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 entries' }))
    await screen.findByTestId('import-done')

    fireEvent.click(screen.getByRole('button', { name: 'Print labels' }))

    expect(await screen.findByText('Labels page')).toBeInTheDocument()
    expect(Object.values(readLabelPreset()).sort((a, b) => a - b)).toEqual([1, 10])
})