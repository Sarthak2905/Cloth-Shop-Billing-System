import { fireEvent, render, screen } from '@testing-library/react'
import { db } from '../db/db'
import { getSettings } from '../db/settingsRepo'
import SettingsPage from './SettingsPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

test('shows the saved settings and saves changes', async () => {
    render(<SettingsPage />)

    const shop = await screen.findByLabelText('Shop name')
    expect(shop).toHaveValue('My Clothing Store')

    fireEvent.change(shop, { target: { value: 'Sarthak Fashions' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(await screen.findByText('Settings saved')).toBeInTheDocument()
    expect((await getSettings()).shopName).toBe('Sarthak Fashions')
})

test('shows an error for an invalid invoice prefix and saves nothing', async () => {
    render(<SettingsPage />)

    const prefix = await screen.findByLabelText('Invoice prefix')
    fireEvent.change(prefix, { target: { value: '!!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(await screen.findByText('Use 1-6 capital letters or digits')).toBeInTheDocument()
    expect((await getSettings()).invoicePrefix).toBe('INV')
})