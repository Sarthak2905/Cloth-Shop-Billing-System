import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../db/db'
import { readLabelPreset } from '../lib/labelPreset'
import ImportPage from './ImportPage'

const HEAD = [
    'Product Name', 'Size', 'Quantity', 'Cost', 'Selling Price',
    'Company', 'Category', 'MRP', 'Tax %', 'Price Includes Tax', 'Allow Discount',
]
const row = (over = {}) => {
    const merged = { 'Product Name': 'Shirt', Size: 'M', Quantity: 10, 'Selling Price': 599, ...over }
    return HEAD.map((h) => merged[h] ?? '')
}

function renderPage(readTableFn, props = {}) {
    return render(
        <MemoryRouter initialEntries={['/import']}>
            <Routes>
                <Route path="/import" element={<ImportPage readTableFn={readTableFn} {...props} />} />
                <Route path="/labels" element={<p>Labels page</p>} />
                <Route path="/products" element={<p>Products list</p>} />
            </Routes>
        </MemoryRouter>,
    )
}
const choose = () =>
    fireEvent.change(screen.getByLabelText('Product file'), {
        target: { files: [new File(['x'], 'products.xlsx')] },
    })

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    sessionStorage.clear()
})

test('the sample file can be downloaded', () => {
    const saveFile = vi.fn()
    renderPage(vi.fn(), { saveFile })

    fireEvent.click(screen.getByRole('button', { name: 'Download sample file' }))

    expect(saveFile).toHaveBeenCalledTimes(1)
    expect(saveFile.mock.calls[0][0]).toBe('product-import-sample.csv')
    expect(saveFile.mock.calls[0][1].charCodeAt(0)).toBe(0xfeff)
})

test('a good file is checked, shown and imported with one click', async () => {
    renderPage(vi.fn(async () => [HEAD, row({ Size: 'M' }), row({ Size: 'L', Quantity: 12 })]))
    choose()

    expect(await screen.findByTestId('import-summary')).toHaveTextContent('2 entries ready to import')
    expect(screen.getByTestId('import-summary')).toHaveTextContent('22 pieces')

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 entries' }))

    expect(await screen.findByTestId('import-done')).toHaveTextContent('2 entries added')
    expect(await db.products.count()).toBe(1)
    expect(await db.variants.count()).toBe(2)
})

test('problem rows are listed with their row numbers and only the good rows are imported', async () => {
    renderPage(vi.fn(async () => [HEAD, row({ Size: 'M' }), row({ Size: 'L', 'Selling Price': 'abc' })]))
    choose()

    await screen.findByTestId('import-summary')
    expect(screen.getByText(/1 row has a problem and will be skipped/)).toBeInTheDocument()
    const problems = screen.getAllByTestId('import-problem')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toHaveTextContent('Row 3')
    expect(problems[0]).toHaveTextContent('Selling Price')

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 entry' }))
    await screen.findByTestId('import-done')
    expect(await db.variants.count()).toBe(1)
})

test('a file without the required columns shows a clear message', async () => {
    renderPage(vi.fn(async () => [['Brand'], ['X']]))
    choose()

    expect(await screen.findByRole('alert')).toHaveTextContent('Missing columns')
    expect(screen.queryByTestId('import-summary')).not.toBeInTheDocument()
})

test('a file that cannot be read shows a message and changes nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => { })
    renderPage(vi.fn(async () => { throw new Error('corrupt') }))
    choose()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not be read'))
    expect(await db.products.count()).toBe(0)
    spy.mockRestore()
})

test('the same file again is warned about and needs a tick before it can be imported', async () => {
    const rows = [HEAD, row({ Size: 'M' }), row({ Size: 'L', Quantity: 12 })]
    renderPage(vi.fn(async () => rows))

    choose()
    await screen.findByTestId('import-summary')
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 entries' }))
    await screen.findByTestId('import-done')

    fireEvent.click(screen.getByRole('button', { name: 'Import another file' }))
    choose()

    expect(await screen.findByTestId('repeat-warning')).toHaveTextContent('imported before')
    const button = screen.getByRole('button', { name: 'Import 2 entries' })
    expect(button).toBeDisabled()

    fireEvent.click(screen.getByLabelText('I want to import it again'))
    expect(button).toBeEnabled()
    fireEvent.click(button)

    await screen.findByTestId('import-done')
    expect(await db.variants.count()).toBe(4)
})

test('after an import, Print labels opens the Labels page with a copy for each piece', async () => {
    renderPage(vi.fn(async () => [HEAD, row({ Size: 'M', Quantity: 10 }), row({ Size: 'L', Quantity: 12 })]))
    choose()
    await screen.findByTestId('import-summary')
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 entries' }))
    await screen.findByTestId('import-done')

    fireEvent.click(screen.getByRole('button', { name: 'Print labels' }))

    expect(await screen.findByText('Labels page')).toBeInTheDocument()
    expect(Object.values(readLabelPreset()).sort((a, b) => a - b)).toEqual([10, 12])
})