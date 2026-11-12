import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { AuthError } from '../sync/apiClient'
import { listAttention, recordAttention } from '../sync/attention'
import { SyncContext } from '../sync/SyncProvider'
import SyncPage from './SyncPage'

const counts = (over = {}) => ({
    products: 0,
    variants: 0,
    movements: 0,
    sales: 0,
    total: 0,
    attention: 0,
    ...over,
})

function renderPage(over = {}) {
    const value = {
        session: null,
        signedIn: false,
        online: true,
        syncing: false,
        counts: counts(),
        lastRun: null,
        lastSuccessAt: null,
        clock: null,
        notice: '',
        api: {},
        signIn: vi.fn(async () => ({})),
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

test('asks for a login when nobody is signed in, and shows why a sign-in failed', async () => {
    const signIn = vi.fn(async () => {
        throw new AuthError('Invalid username or password')
    })
    renderPage({ signIn })

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: ' owner ' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid username or password')).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith('owner', 'wrong-password')
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled()
})

test('shows who is signed in and what is waiting, and syncs on request', () => {
    const value = renderPage({
        signedIn: true,
        session: { token: 't', user: { displayName: 'Owner', role: 'admin' } },
        counts: counts({ products: 1, variants: 2, movements: 3, sales: 4, total: 10 }),
    })

    expect(screen.getByText(/Owner \(admin\)/)).toBeInTheDocument()
    expect(screen.getByText(/3 catalogue changes, 3 stock changes, 4 sales/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(value.syncNow).toHaveBeenCalledTimes(1)
})

test('lists refused items with the reason, and Retry puts the sale back in the queue', async () => {
    await db.sales.add({ id: 's1', invoiceNumber: 'INV-000001', syncStatus: 'review', createdAt: 'x' })
    await recordAttention(
        { kind: 'sale', entityId: 's1', entityTime: '2026-10-30T10:00:00.000Z', label: 'INV-000001' },
        { code: 'UNKNOWN_VARIANT', message: 'Item does not exist' },
    )
    renderPage({ signedIn: true, session: { token: 't', user: {} } })

    expect(await screen.findByText('Item does not exist')).toBeInTheDocument()
    expect(screen.getByText('UNKNOWN_VARIANT')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry INV-000001' }))

    await waitFor(async () => expect(await listAttention()).toHaveLength(0))
    expect((await db.sales.get('s1')).syncStatus).toBe('pending')
})

test('the stock check lists the items that differ from the server', async () => {
    await seedSampleData()
    const variants = await db.variants.toArray()
    const items = variants.map((v) => ({
        variantId: v.id,
        sku: v.sku,
        currentStock: v.id === variants[0].id ? v.currentStock + 5 : v.currentStock,
    }))
    renderPage({
        signedIn: true,
        session: { token: 't', user: {} },
        api: { stockLevels: async () => ({ items }) },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Compare stock with server' }))

    const result = await screen.findByTestId('stock-result')
    expect(result).toHaveTextContent('9 items checked')
    expect(result).toHaveTextContent(
        `${variants[0].sku}: this device ${variants[0].currentStock}, server ${variants[0].currentStock + 5}`,
    )
})