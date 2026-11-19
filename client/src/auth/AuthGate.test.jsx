import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { hasVerifier, saveVerifier, verifyOffline } from '../security/passwordVerifier'
import { AuthError, NetworkError } from '../sync/apiClient'
import { runSync } from '../sync/engine'
import { loadSession, saveSession } from '../sync/session'
import AuthGate, { useAuth } from './AuthGate'
import { loadUnlock, saveUnlock } from './unlock'

vi.mock('../sync/engine', () => ({ runSync: vi.fn() }))
vi.mock('../security/passwordVerifier', () => ({
    saveVerifier: vi.fn(),
    verifyOffline: vi.fn(),
    hasVerifier: vi.fn(),
}))

const admin = { id: 'u1', username: 'owner', displayName: 'Shop Owner', role: 'admin' }
const OPEN = 'App is open for Shop Owner'

function Inside() {
    const { user, lock } = useAuth()
    return (
        <div>
            <p>App is open for {user?.displayName}</p>
            <button type="button" onClick={lock}>
                Lock now
            </button>
        </div>
    )
}

const makeApi = (login = vi.fn(async () => ({ token: 'tok', user: admin }))) => ({ login })
const renderGate = (api = makeApi()) => {
    render(
        <AuthGate api={api}>
            <Inside />
        </AuthGate>,
    )
    return api
}
const addProduct = () =>
    db.products.add({ id: 'p1', name: 'Shirt', category: '', brand: '', supplier: '', status: 'active' })
const signIn = (name = 'owner', password = 'pw') => {
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: name } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    runSync.mockReset()
    verifyOffline.mockReset()
    saveVerifier.mockReset().mockResolvedValue(true)
    hasVerifier.mockReset().mockReturnValue(false)
})

test('nothing opens without signing in', () => {
    renderGate()

    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.queryByText(OPEN)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
})

test('a right sign-in opens the app, and keeps the sign-in, the lock record and the offline check', async () => {
    await addProduct()
    const api = renderGate()

    signIn(' owner ', 'pw')

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(api.login).toHaveBeenCalledWith('owner', 'pw')
    expect(loadSession()).toMatchObject({ token: 'tok' })
    expect(loadUnlock()).toMatchObject({ username: 'owner' })
    expect(saveVerifier).toHaveBeenCalledWith(admin, 'pw')
    expect(runSync).not.toHaveBeenCalled() // this computer already has data
})

test('a wrong password shows the reason and opens nothing', async () => {
    renderGate(
        makeApi(
            vi.fn(async () => {
                throw new AuthError('Invalid username or password')
            }),
        ),
    )

    signIn('owner', 'wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password')
    expect(screen.queryByText(OPEN)).not.toBeInTheDocument()
    expect(loadUnlock()).toBeNull()
    expect(loadSession()).toBeNull()
})

test('an account that is not the owner is refused, and nothing is kept', async () => {
    renderGate(makeApi(vi.fn(async () => ({ token: 'tok', user: { ...admin, role: 'cashier' } }))))

    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('This app is for the shop owner (admin) account.')
    expect(loadSession()).toBeNull()
    expect(loadUnlock()).toBeNull()
    expect(saveVerifier).not.toHaveBeenCalled()
})

test('when the server cannot be reached the password is checked on this computer', async () => {
    await addProduct()
    verifyOffline.mockResolvedValue({ ok: true, user: admin })
    renderGate(
        makeApi(
            vi.fn(async () => {
                throw new NetworkError('Could not reach the server')
            }),
        ),
    )

    signIn('owner', 'pw')

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(verifyOffline).toHaveBeenCalledWith('owner', 'pw')
    expect(loadUnlock()).toMatchObject({ username: 'owner' })
    expect(loadSession()).toBeNull() // no server login yet, so no token: syncing waits for one
})

test.each([
    [{ ok: false, reason: 'wrong' }, /wrong for signing in without internet/],
    [{ ok: false, reason: 'none' }, /first sign-in needs internet/],
    [{ ok: false, reason: 'expired' }, /more than 30 days old/],
    [{ ok: false, reason: 'locked', retryInMs: 120_000 }, /Try again in 2 minutes/],
    [{ ok: false, reason: 'locked', retryInMs: 30_000 }, /Try again in 1 minute\./],
    [{ ok: false, reason: 'unsupported' }, /cannot check the password/],
])('signing in without internet that fails says why: %o', async (result, message) => {
    verifyOffline.mockResolvedValue(result)
    renderGate(
        makeApi(
            vi.fn(async () => {
                throw new NetworkError('Could not reach the server')
            }),
        ),
    )

    signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText(OPEN)).not.toBeInTheDocument()
    expect(loadUnlock()).toBeNull()
})

test('a computer that is still unlocked opens at once, without asking', async () => {
    await addProduct()
    saveUnlock(admin)

    renderGate()

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
})

test('after 14 days the sign-in is asked for again', () => {
    localStorage.setItem('clothing-pos-unlock', JSON.stringify({ username: 'owner', until: Date.now() - 1000 }))

    renderGate()

    expect(screen.getByLabelText('Username')).toBeInTheDocument()
})

test('the sign-in screen mentions that this computer can sign in without internet, once it can', () => {
    hasVerifier.mockReturnValue(true)

    renderGate()

    expect(screen.getByText(/without internet/)).toBeInTheDocument()
})

test('a new computer, after signing in, downloads its data with progress and then opens', async () => {
    let finish
    runSync.mockImplementation(
        ({ onProgress }) =>
            new Promise((resolve) => {
                onProgress({ kind: 'sales', done: 5, total: 10 })
                finish = () => resolve({ outcome: 'ok' })
            }),
    )
    renderGate()

    signIn()

    expect(await screen.findByText('Downloading your shop data')).toBeInTheDocument()
    expect(await screen.findByText('Downloading bills: 5 of 10')).toBeInTheDocument()
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(runSync).toHaveBeenCalledWith(expect.objectContaining({ pull: true, forcePull: true }))
    expect(screen.queryByText(OPEN)).not.toBeInTheDocument()

    finish()
    expect(await screen.findByText(OPEN)).toBeInTheDocument()
})

test('a computer that is already unlocked but has no data and a sign-in also downloads first', async () => {
    saveUnlock(admin)
    saveSession({ token: 'tok', user: admin })
    runSync.mockResolvedValue({ outcome: 'ok' })

    renderGate()

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).toHaveBeenCalledTimes(1)
})

test('a computer with data, or one that already synced, does not download first', async () => {
    saveUnlock(admin)
    saveSession({ token: 'tok', user: admin })
    await db.settings.put({ key: 'sync.lastSuccessAt', value: '2026-11-19T09:00:00.000Z' })

    renderGate()

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).not.toHaveBeenCalled()
})

test('a computer with no data and no sign-in (offline) opens without downloading', async () => {
    saveUnlock(admin)

    renderGate()

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).not.toHaveBeenCalled()
})

test('a download that fails shows why, can be tried again, and then opens', async () => {
    saveUnlock(admin)
    saveSession({ token: 'tok', user: admin })
    runSync
        .mockResolvedValueOnce({ outcome: 'offline', message: 'Could not reach the server' })
        .mockResolvedValueOnce({ outcome: 'ok' })
    renderGate()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
    expect(runSync).toHaveBeenCalledTimes(2)
})

test('the app can be opened without data after a failed download, with a warning', async () => {
    saveUnlock(admin)
    saveSession({ token: 'tok', user: admin })
    runSync.mockResolvedValue({ outcome: 'server-error', message: 'The server had a problem' })
    renderGate()

    await screen.findByRole('alert')
    expect(screen.getByText(/shop data will not be on this computer/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open the app without data' }))

    expect(await screen.findByText(OPEN)).toBeInTheDocument()
})

test('a sign-in that is no longer valid asks to sign in again instead of retrying', async () => {
    saveUnlock(admin)
    saveSession({ token: 'old', user: admin })
    runSync.mockResolvedValue({ outcome: 'auth' })
    renderGate()

    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in again')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))

    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(loadUnlock()).toBeNull()
})

test('a download that throws is shown as a failure, not a blank screen', async () => {
    saveUnlock(admin)
    saveSession({ token: 'tok', user: admin })
    runSync.mockRejectedValue(new Error('Something broke on this computer'))
    renderGate()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something broke on this computer')
})

test('Lock asks for the sign-in again, and keeps the data and the sync sign-in', async () => {
    await addProduct()
    saveUnlock(admin)
    saveSession({ token: 'tok', user: admin })
    renderGate()
    await screen.findByText(OPEN)

    fireEvent.click(screen.getByRole('button', { name: 'Lock now' }))

    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(loadUnlock()).toBeNull()
    expect(loadSession()).toMatchObject({ token: 'tok' })
    expect(await db.products.count()).toBe(1)
})

test('without the gate there is nobody to lock', () => {
    function Probe() {
        const { user, lock } = useAuth()
        return <p>{user === null && typeof lock === 'function' ? 'no gate' : 'gate'}</p>
    }

    render(<Probe />)

    expect(screen.getByText('no gate')).toBeInTheDocument()
})