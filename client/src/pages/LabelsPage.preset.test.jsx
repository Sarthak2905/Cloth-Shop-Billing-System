import { renderLabelsPage } from '../test-utils/renderLabelsPage'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../db/db'
import { addStockEntries } from '../db/stockEntryRepo'
import { readLabelPreset, setLabelPreset } from '../lib/labelPreset'


beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    sessionStorage.clear()
})

async function twoEntries() {
    const { entries } = await addStockEntries({
        name: 'Cotton Shirt',
        rows: [
            { size: 'M', quantity: 3, sellingPricePaise: 59900 },
            { size: 'L', quantity: 150, sellingPricePaise: 59900 },
        ],
    })
    return entries
}

test('labels coming from the Add stock screen are already filled in', async () => {
    const [m] = await twoEntries()
    setLabelPreset({ [m.id]: 3 })

    renderLabelsPage()

    await waitFor(() => expect(screen.getByLabelText('Copies of Cotton Shirt size M')).toHaveValue(3))
    expect(screen.getByText('3 labels')).toBeInTheDocument()
    expect(readLabelPreset()).toEqual({})
})

test('"Copies = stock" fills one label for each piece in stock, up to 99', async () => {
    await twoEntries()
    renderLabelsPage()

    // wait until the items have loaded, so the button is enabled
    await screen.findByLabelText('Copies of Cotton Shirt size M')
    fireEvent.click(screen.getByRole('button', { name: 'Copies = stock for items shown' }))

    await waitFor(() =>
        expect(screen.getByLabelText('Copies of Cotton Shirt size M')).toHaveValue(3),
    )
    expect(screen.getByLabelText('Copies of Cotton Shirt size L')).toHaveValue(99)
})