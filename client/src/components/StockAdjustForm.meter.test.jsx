import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../db/db'
import { addStockEntries } from '../db/stockEntryRepo'
import StockAdjustForm from './StockAdjustForm'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

async function setup() {
    const { entries } = await addStockEntries({
        name: 'Pant Piece', unit: 'meter',
        rows: [{ size: 'Grey 101', quantity: 2550, sellingPricePaise: 45000 }],
    })
    const onDone = vi.fn()
    render(<StockAdjustForm variant={entries[0]} onDone={onDone} />)
    return { entry: entries[0], onDone }
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

test('removing 2.5 m takes 250 cm off the stock', async () => {
    const { entry, onDone } = await setup()

    type('Change in meters', '-2.5')
    type('Reason', 'Cut by mistake')
    apply()

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect((await db.variants.get(entry.id)).currentStock).toBe(2300)
    const movement = (await db.stockMovements.toArray()).find((m) => m.type === 'adjustment')
    expect(movement).toMatchObject({ quantityChange: -250, stockAfter: 2300 })
})

test('adding 10 m puts 1000 cm on the stock', async () => {
    const { entry, onDone } = await setup()

    type('Change in meters', '+10')
    type('Reason', 'New roll counted')
    apply()

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect((await db.variants.get(entry.id)).currentStock).toBe(3550)
})

test('a wrong length or zero is explained and nothing changes', async () => {
    const { entry, onDone } = await setup()

    type('Change in meters', 'abc')
    type('Reason', 'Test')
    apply()
    expect(await screen.findByText('Enter a length like -2.5 or 10')).toBeInTheDocument()

    type('Change in meters', '0')
    apply()
    expect(await screen.findByText('Enter a length other than zero')).toBeInTheDocument()

    expect(onDone).not.toHaveBeenCalled()
    expect((await db.variants.get(entry.id)).currentStock).toBe(2550)
})

test('taking out more than there is says how much is in stock, in meters', async () => {
    const { entry } = await setup()

    type('Change in meters', '-30')
    type('Reason', 'Test')
    apply()

    expect(await screen.findByText(/Only 25\.50 m in stock/)).toBeInTheDocument()
    expect((await db.variants.get(entry.id)).currentStock).toBe(2550)
})

test('a reason is still required', async () => {
    const { entry } = await setup()

    type('Change in meters', '-1')
    apply()

    expect(await screen.findByText('A reason is required for stock adjustments')).toBeInTheDocument()
    expect((await db.variants.get(entry.id)).currentStock).toBe(2550)
})