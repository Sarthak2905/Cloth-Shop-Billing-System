import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { runSync } from '../sync/engine'
import { saveSession } from '../sync/session'
import AuthGate, { useAuth } from './AuthGate'
import { saveUnlock } from './unlock'

vi.mock('../sync/engine', () => ({ runSync: vi.fn() }))
vi.mock('../security/passwordVerifier', () => ({
    saveVerifier: vi.fn(),
    verifyOffline: vi.fn(),
    hasVerifier: vi.fn(() => false),
}))

const admin = { id: 'u1', username: 'owner', displayName: 'Shop Owner', role: 'admin' }
const OPEN = 'App is open'
const EMPTY_SERVER = { products: 0, variants: 0, sales: 0, movements: 0 }
const FULL_SERVER = { products: 5, variants: 9, sales: 3, movements: 9 }

function Inside() {
    const { user } = useAuth()
    return <p>{user ? OPEN : 'no user'}</p>
}

const addProduct = () =>
    db.products.add({ id: 'p1', name: 'Shirt', category: '', brand: '', supplier: '', status: 'active' })

function renderGate(counts, saveFile = vi.fn()) {
    const api = {
        login: vi.fn(),
        pullSummary: vi.fn(async () => {
            if (counts instanceof Error) throw counts
            return counts === undefined ? undefined : { counts }
        }),
    }
    render(
        <AuthGate api={api} saveFile={saveFile}>
            <Inside />
        </AuthGate>,
    )
    return { api, saveFile }
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    runSync.mockReset()
    saveUnlock(admin)
    saveSession({ token: 'tok', user: admin })
})

test('data on this computer and an empty server: the data is sent by itself, with nothing to press', async () => {
    await addProduct()
    runSync.mockResolvedValue({ outcome: 'ok' })

    renderGate(EMPTY_SERVER)

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(runSync).toHaveBeenCalledWith(expect.objectContaining({ pull: true, forcePull: true }))
    expect(await db.products.count()).toBe(1)
})

test('the sending screen says what is happening', async () => {
    await addProduct()
    runSync.mockImplementation(() => new Promise(() => { }))

    renderGate(EMPTY_SERVER)

    expect(await screen.findByText('Sending your shop data to the server')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Sending your data...')
})

test('data on both sides: it asks once which one is the real data, and does nothing before the answer', async () => {
    await addProduct()
    await db.sales.add({ id: 's1', invoiceNumber: 'INV-000001', createdAt: '2026-11-19T10:00:00.000Z' })

    renderGate(FULL_SERVER)

    expect(await screen.findByText('Which data is the real one?')).toBeInTheDocument()
    const counts = screen.getByTestId('choose-counts')
    expect(counts).toHaveTextContent('This computer: 1 products, 1 bills')
    expect(counts).toHaveTextContent('Server: 5 products, 3 bills')
    expect(runSync).not.toHaveBeenCalled()
    expect(await db.products.count()).toBe(1)
    expect(screen.queryByText(OPEN)).not.toBeInTheDocument()
})

test("\"Use the server's data\" saves a backup file first, empties this computer and downloads", async () => {
    await addProduct()
    await db.settings.put({ key: 'invoiceCounter', value: 7 })
    runSync.mockImplementation(async () => {
        // by now this computer has been emptied, as a new one
        expect(await db.products.count()).toBe(0)
        return { outcome: 'ok' }
    })
    const { saveFile } = renderGate(FULL_SERVER)
    await screen.findByText('Which data is the real one?')

    fireEvent.click(screen.getByRole('button', { name: "Use the server's data" }))

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(saveFile).toHaveBeenCalledTimes(1)
    const [name, text] = saveFile.mock.calls[0]
    expect(name).toMatch(/^before-replace-.*\.json$/)
    expect(JSON.parse(text).tables.products).toHaveLength(1)
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(await db.settings.get('invoiceCounter')).toBeUndefined()
})

test('if the backup file cannot be made, nothing is deleted and the choice stays', async () => {
    await addProduct()
    const saveFile = vi.fn(() => {
        throw new Error('disk full')
    })
    vi.spyOn(console, 'error').mockImplementation(() => { })
    renderGate(FULL_SERVER, saveFile)
    await screen.findByText('Which data is the real one?')

    fireEvent.click(screen.getByRole('button', { name: "Use the server's data" }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was changed')
    expect(await db.products.count()).toBe(1)
    expect(runSync).not.toHaveBeenCalled()
    vi.restoreAllMocks()
})

test("\"Send this computer's data\" keeps the data here and sends it", async () => {
    await addProduct()
    runSync.mockResolvedValue({ outcome: 'ok' })
    const { saveFile } = renderGate(FULL_SERVER)
    await screen.findByText('Which data is the real one?')

    fireEvent.click(screen.getByRole('button', { name: "Send this computer's data to the server" }))

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(saveFile).not.toHaveBeenCalled()
    expect(await db.products.count()).toBe(1)
})

test('when the server cannot be asked, the app opens as usual and nothing is sent or changed', async () => {
    await addProduct()

    renderGate(new Error('offline'))

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).not.toHaveBeenCalled()
    expect(await db.products.count()).toBe(1)
})

test('a server answer without counts opens the app as usual', async () => {
    await addProduct()

    renderGate(undefined)

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).not.toHaveBeenCalled()
})

test('a computer that already synced does not even ask the server how much it has', async () => {
    await addProduct()
    await db.settings.put({ key: 'sync.lastSuccessAt', value: '2026-11-19T09:00:00.000Z' })

    const { api } = renderGate(FULL_SERVER)

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    await waitFor(() => expect(api.pullSummary).not.toHaveBeenCalled())
    expect(runSync).not.toHaveBeenCalled()
})

test('an empty computer downloads by itself, with nothing to press', async () => {
    runSync.mockResolvedValue({ outcome: 'ok' })

    const { api } = renderGate(FULL_SERVER)

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(api.pullSummary).not.toHaveBeenCalled()
})

test('a failed sending can be tried again, or the app can be opened and the data kept', async () => {
    await addProduct()
    runSync
        .mockResolvedValueOnce({ outcome: 'offline', message: 'Could not reach the server' })
        .mockResolvedValueOnce({ outcome: 'server-error', message: 'The server had a problem' })
    renderGate(EMPTY_SERVER)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The server had a problem')).toBeInTheDocument()
    expect(screen.getByText(/It can be sent later from the Sync page/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open the app without sending' }))

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(await db.products.count()).toBe(1)
})