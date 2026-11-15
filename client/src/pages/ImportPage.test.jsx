import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import ImportPage from './ImportPage'

const HEAD = [
    'Product Name', 'Category', 'Brand', 'Supplier', 'Size', 'SKU', 'Barcode',
    'Cost Price', 'MRP', 'Selling Price', 'Tax %', 'Price Includes Tax',
    'Opening Stock', 'Low Stock Alert', 'Allow Discount',
]
const row = (over = {}) => {
    const merged = { 'Product Name': 'Shirt', Category: 'Shirts', Size: 'M', 'Selling Price': 599, ...over }
    return HEAD.map((h) => merged[h] ?? '')
}

function renderPage(readTableFn, props = {}) {
    return render(
        <MemoryRouter>
            <ImportPage readTableFn={readTableFn} {...props} />
        </MemoryRouter>,
    )
}
const choose = () =>
    fireEvent.change(screen.getByLabelText('Product file'), {
        target: { files: [new File(['x'], 'products.xlsx')] },
    })

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
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
    renderPage(vi.fn(async () => [HEAD, row({ Size: 'M' }), row({ Size: 'L' })]))
    choose()

    const summary = await screen.findByTestId('import-summary')
    expect(summary).toHaveTextContent('2 items ready to import')

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 items' }))

    expect(await screen.findByTestId('import-done')).toHaveTextContent('2 items added')
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

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 item' }))
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