import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import DatabaseGate from './DatabaseGate'

afterEach(() => {
    vi.restoreAllMocks()
})

function renderGate() {
    return render(
        <DatabaseGate>
            <p>App is here</p>
        </DatabaseGate>,
    )
}

test('shows the app once the database opens', async () => {
    renderGate()
    expect(await screen.findByText('App is here')).toBeInTheDocument()
})

test('shows a clear problem screen when the database cannot open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => { })
    vi.spyOn(db, 'open').mockRejectedValue(
        Object.assign(new Error('full'), { name: 'QuotaExceededError' }),
    )

    renderGate()

    expect(await screen.findByText('Local storage problem')).toBeInTheDocument()
    expect(screen.getByText(/out of storage space/)).toBeInTheDocument()
    expect(screen.queryByText('App is here')).not.toBeInTheDocument()
})

test('Try again opens the database and shows the app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => { })
    vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('boom'))

    renderGate()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('App is here')).toBeInTheDocument()
})