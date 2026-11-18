import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { recordAttention } from '../sync/attention'
import { SyncContext } from '../sync/SyncProvider'
import SyncPage from './SyncPage'

const counts = (over = {}) => ({
    products: 3, variants: 9, movements: 9, sales: 2, payments: 0, cancels: 0, total: 23, attention: 0, ...over,
})

function renderPage(over = {}) {
    const value = {
        session: { token: 't', user: { displayName: 'Owner', role: 'admin' } },
        signedIn: true,
        online: true,
        syncing: false,
        counts: counts(),
        lastRun: null,
        lastSuccessAt: null,
        clock: null,
        notice: '',
        api: {},
        signIn: vi.fn(),
        signOut: vi.fn(),
        syncNow: vi.fn(),
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

test('before the first sync it says what will be sent and needs a backup tick', () => {
    const value = renderPage()

    const card = screen.getByTestId('first-sync')
    expect(card).toHaveTextContent('3 products and 9 items')
    expect(card).toHaveTextContent('9 stock records')
    expect(card).toHaveTextContent('2 bills')

    const start = screen.getByRole('button', { name: 'Start first sync' })
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/I have made a backup/))
    expect(start).toBeEnabled()

    fireEvent.click(start)
    expect(value.syncNow).toHaveBeenCalledTimes(1)
})

test('the first-sync card is not shown after a sync, with nothing waiting, or when nobody is signed in', () => {
    const first = renderPage({ lastSuccessAt: '2026-11-17T09:00:00.000Z' })
    expect(screen.queryByTestId('first-sync')).not.toBeInTheDocument()
    expect(first.syncNow).not.toHaveBeenCalled()
})

test('nothing waiting means no first-sync card', () => {
    renderPage({ counts: counts({ products: 0, variants: 0, movements: 0, sales: 0, total: 0 }) })

    expect(screen.queryByTestId('first-sync')).not.toBeInTheDocument()
})

test('a signed-out device asks for a sign-in instead', () => {
    renderPage({ signedIn: false, session: null })

    expect(screen.queryByTestId('first-sync')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
})

test('payments and cancellations that are waiting are counted', () => {
    renderPage({ lastSuccessAt: '2026-11-17T09:00:00.000Z', counts: counts({ payments: 2, cancels: 1, total: 26 }) })

    expect(screen.getByText(/2 payments, 1 cancellations/)).toBeInTheDocument()
})

test('a refused payment is listed by its own name, and can be retried', async () => {
    await db.sales.add({ id: 's1', invoiceNumber: 'INV-000001', syncStatus: 'synced', createdAt: 'x' })
    await recordAttention(
        { kind: 'salepay', entityId: 's1', entityTime: '2026-11-17T10:00:00.000Z', label: 'Payment of INV-000001' },
        { code: 'INVALID_PAYMENT', message: 'Wrong payment' },
    )
    renderPage({ lastSuccessAt: '2026-11-17T09:00:00.000Z' })

    expect(await screen.findByText('Payment of INV-000001')).toBeInTheDocument()
    expect(screen.getByText('Wrong payment')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry Payment of INV-000001' }))
    await screen.findByText('Sync with server')
    expect((await db.sales.get('s1')).paymentPending).toBe(1)
})