import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { SyncContext } from '../sync/SyncProvider'
import SyncPage from './SyncPage'

const counts = (over = {}) => ({
    products: 0, variants: 0, movements: 0, sales: 0, payments: 0, cancels: 0, total: 0, attention: 0, ...over,
})

function renderPage(over = {}) {
    const value = {
        session: { token: 't', user: { displayName: 'Owner', role: 'admin' } },
        signedIn: true,
        online: true,
        syncing: false,
        pullProgress: null,
        counts: counts(),
        lastRun: null,
        lastPull: null,
        lastSuccessAt: null,
        clock: null,
        notice: '',
        api: {},
        signIn: vi.fn(),
        signOut: vi.fn(),
        syncNow: vi.fn(),
        pullNow: vi.fn(),
        ...over,
    }
    render(
        <SyncContext.Provider value={value}>
            <SyncPage />
        </SyncContext.Provider>,
    )
    return value
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

test('a device with no data asks for the shop data to be downloaded', async () => {
    const value = renderPage()

    expect(await screen.findByText('Download your shop data')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download data from server' }))
    expect(value.pullNow).toHaveBeenCalledTimes(1)
})

test('a device that already has data offers the download as a normal action', async () => {
    await db.products.add({ id: 'p1', name: 'Shirt', category: '', brand: '', supplier: '', status: 'active' })
    renderPage({ lastSuccessAt: '2026-11-19T09:00:00.000Z' })

    expect(await screen.findByText('Download from server')).toBeInTheDocument()
    expect(screen.queryByText('Download your shop data')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download data from server' })).toBeEnabled()
})

test('the download button is off when nobody is signed in or a sync is running', async () => {
    await db.products.add({ id: 'p1', name: 'Shirt', category: '', brand: '', supplier: '', status: 'active' })
    renderPage({ syncing: true, lastSuccessAt: '2026-11-19T09:00:00.000Z' })

    expect(await screen.findByRole('button', { name: 'Working...' })).toBeDisabled()
})

test('progress and the result of the last download are shown', async () => {
    await db.products.add({ id: 'p1', name: 'Shirt', category: '', brand: '', supplier: '', status: 'active' })
    renderPage({
        lastSuccessAt: '2026-11-19T09:00:00.000Z',
        syncing: true,
        pullProgress: { kind: 'sales', done: 40, total: 120 },
        lastPull: {
            at: '2026-11-19T09:30:00.000Z', products: 3, variants: 9, movements: 12, sales: 5,
            skipped: 2, stockChanged: 4, conflicts: ['Invoice INV-000001 is used by a different bill on this device'],
        },
    })

    expect(await screen.findByText('Downloading bills: 40 of 120')).toBeInTheDocument()
    const result = screen.getByTestId('download-result')
    expect(result).toHaveTextContent('3 products, 9 items, 12 stock records, 5 bills')
    expect(result).toHaveTextContent('Stock of 4 items was updated from the server')
    expect(result).toHaveTextContent('2 changes made on this device were kept')
    expect(screen.getByRole('alert')).toHaveTextContent('Invoice INV-000001 is used by a different bill')
})

test('nothing is offered while nobody is signed in', () => {
    renderPage({ signedIn: false, session: null })

    expect(screen.queryByTestId('download-card')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
})