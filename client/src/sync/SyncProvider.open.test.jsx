import { act, render, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { fakeServer, product } from '../test-utils/pullFixtures'
import { saveSession } from './session'
import SyncProvider from './SyncProvider'
import { cleanup } from '@testing-library/react'

afterEach(async () => {
    cleanup()   // unmount SyncProvider, which stops the old sync loop
    await new Promise((resolve) => setTimeout(resolve, 150))   // let any pull already in flight finish
})

beforeEach(() => {
    vi.clearAllMocks()   // forget calls left over from the previous test
})

function makeApi() {
    const server = fakeServer({ products: [product('p1')], variants: [], movements: [], sales: [] })
    return {
        push: vi.fn(async () => ({ results: [] })),
        status: vi.fn(async () => ({ serverTime: new Date().toISOString() })),
        pullPage: server.pullPage,
        pullSummary: server.pullSummary,
    }
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
})

test('when the app opens it downloads once by itself, with nothing waiting to send', async () => {
    saveSession({ token: 'tok', user: {} })
    const api = makeApi()

    render(
        <SyncProvider api={api} autoDelayMs={10} intervalMs={100000} firstSyncManual={false}>
            <p>app</p>
        </SyncProvider>,
    )

    await waitFor(() => expect(api.pullPage).toHaveBeenCalled())
    await waitFor(async () => expect(await db.products.count()).toBe(1))
})

test('nothing happens when nobody is signed in', async () => {
    const api = makeApi()

    render(
        <SyncProvider api={api} autoDelayMs={10} intervalMs={100000} firstSyncManual={false}>
            <p>app</p>
        </SyncProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(api.pullPage).not.toHaveBeenCalled()
})

test('before the first sync has worked, nothing starts by itself', async () => {
    saveSession({ token: 'tok', user: {} })
    const api = makeApi()

    render(
        <SyncProvider api={api} autoDelayMs={10} intervalMs={100000}>
            <p>app</p>
        </SyncProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(api.pullPage).not.toHaveBeenCalled()
})