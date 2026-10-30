import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import StoragePage from './StoragePage'

function setStorage(value) {
    Object.defineProperty(navigator, 'storage', { value, configurable: true })
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

afterEach(() => {
    setStorage(undefined)
})

test('shows how much storage is used and warns when it is not protected', async () => {
    setStorage({
        estimate: async () => ({ usage: 5_000_000, quota: 100_000_000 }),
        persisted: async () => false,
        persist: vi.fn(async () => true),
    })
    render(<StoragePage />)

    const used = await screen.findByTestId('storage-used')
    expect(used).toHaveTextContent('4.8 MB')
    expect(used).toHaveTextContent('5%')
    expect(await screen.findByText(/may clear this data/)).toBeInTheDocument()
    expect(await screen.findByText(/0 products, 0 variants, 0 sales/)).toBeInTheDocument()
})

test('asks the browser to protect the data when the button is pressed', async () => {
    const persist = vi.fn(async () => true)
    setStorage({
        estimate: async () => ({ usage: 1000, quota: 1_000_000 }),
        persisted: async () => false,
        persist,
    })
    render(<StoragePage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Protect this data' }))

    expect(await screen.findByText('The browser agreed to keep this data.')).toBeInTheDocument()
    expect(persist).toHaveBeenCalledTimes(1)
})