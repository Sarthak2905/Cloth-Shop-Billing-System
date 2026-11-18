import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { newId } from '../lib/id'
import { saveSession } from './session'
import SyncProvider, { useSync } from './SyncProvider'

const answer = (ops) => ({
    results: ops.map((op, index) => ({ index, type: op.type, id: op.data.id, status: 'applied' })),
})
const makeApi = () => ({
    login: vi.fn(),
    push: vi.fn(async (ops) => answer(ops)),
    status: vi.fn(async () => ({ serverTime: new Date().toISOString() })),
    stockLevels: vi.fn(async () => ({ items: [] })),
})

function Consumer() {
    const sync = useSync()
    return (
        <button type="button" onClick={() => sync.syncNow()}>
            Sync now
        </button>
    )
}

async function sell(index) {
    const variant = (await db.variants.toArray())[index]
    const product = await db.products.get(variant.productId)
    const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
    await createSale({ id: newId(), cart, payment: { method: 'cash' } })
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
})

test('nothing is sent by itself before the first sync, and syncing runs by itself after it', async () => {
    saveSession({ token: 'tok', user: {} })
    await seedSampleData()
    await sell(0)
    const api = makeApi()

    render(
        <SyncProvider api={api} autoDelayMs={10} intervalMs={30}>
            <Consumer />
        </SyncProvider>,
    )
    await wait(200)
    expect(api.push).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
    await waitFor(() => expect(api.push).toHaveBeenCalled())
    await waitFor(async () =>
        expect((await db.settings.get('sync.lastSuccessAt'))?.value).toBeTruthy(),
    )

    const callsAfterFirst = api.push.mock.calls.length
    await sell(1)
    await waitFor(() => expect(api.push.mock.calls.length).toBeGreaterThan(callsAfterFirst))
})

test('a device that was synced before keeps syncing by itself', async () => {
    saveSession({ token: 'tok', user: {} })
    await seedSampleData()
    await sell(0)
    await db.settings.put({ key: 'sync.lastSuccessAt', value: '2026-11-17T09:00:00.000Z' })
    const api = makeApi()

    render(
        <SyncProvider api={api} autoDelayMs={10} intervalMs={30}>
            <Consumer />
        </SyncProvider>,
    )

    await waitFor(() => expect(api.push).toHaveBeenCalled())
})