import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import { AuthError, NetworkError } from './apiClient'
import { SESSION_KEY, loadSession, saveSession } from './session'
import SyncProvider, { useSync } from './SyncProvider'

const answerAll = async ({ ops }) => answer(ops)
const answer = (ops) => ({
  results: ops.map((op, index) => ({ index, type: op.type, id: op.data.id, status: 'applied' })),
})

function makeApi(over = {}) {
  return {
    login: vi.fn(async () => ({ token: 'tok', user: { displayName: 'Owner', role: 'admin' } })),
    push: vi.fn(async (ops) => answer(ops)),
    status: vi.fn(async () => ({ serverTime: new Date().toISOString() })),
    stockLevels: vi.fn(async () => ({ items: [] })),
    ...over,
  }
}

function Consumer() {
  const sync = useSync()
  return (
    <div>
      <p data-testid="signed-in">{String(sync.signedIn)}</p>
      <p data-testid="notice">{sync.notice}</p>
      <button type="button" onClick={() => sync.signIn('owner', 'pw')}>
        Sign in
      </button>
      <button type="button" onClick={() => sync.syncNow()}>
        Sync now
      </button>
    </div>
  )
}

async function seedAndSell() {
  await seedSampleData()
  const variant = (await db.variants.toArray())[0]
  const product = await db.products.get(variant.productId)
  const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
  await createSale({ id: newId(), cart, payment: { method: 'cash' } })
}

function renderProvider(api) {
  return render(
    <SyncProvider api={api} autoDelayMs={10} intervalMs={30}>
      <Consumer />
    </SyncProvider>,
  )
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  localStorage.clear()
})

test('syncs waiting work on its own when signed in', async () => {
  saveSession({ token: 'tok', user: {} })
  await seedAndSell()
  const api = makeApi()

  renderProvider(api)

  await waitFor(() => expect(api.push).toHaveBeenCalled())
  await waitFor(async () => {
    expect((await db.sales.toArray())[0].syncStatus).toBe('synced')
  })
})

test('does nothing when nobody is signed in', async () => {
  await seedAndSell()
  const api = makeApi()

  renderProvider(api)
  await wait(150)

  expect(api.push).not.toHaveBeenCalled()
})

test('signing in keeps the session and starts syncing', async () => {
  await seedAndSell()
  const api = makeApi()

  renderProvider(api)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() => expect(loadSession()?.token).toBe('tok'))
  await waitFor(() => expect(api.push).toHaveBeenCalled())
  expect(screen.getByTestId('signed-in')).toHaveTextContent('true')
})

test('an expired login ends the session and asks for a new sign-in', async () => {
  saveSession({ token: 'tok', user: {} })
  await seedAndSell()
  const api = makeApi({
    push: vi.fn(async () => {
      throw new AuthError('expired')
    }),
  })

  renderProvider(api)

  await waitFor(() => expect(screen.getByTestId('signed-in')).toHaveTextContent('false'))
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  expect(screen.getByTestId('notice')).toHaveTextContent(/sign in/i)
})

test('after a failure it waits before trying again by itself, but Sync now tries at once', async () => {
  saveSession({ token: 'tok', user: {} })
  await seedAndSell()
  const api = makeApi({
    push: vi.fn(async () => {
      throw new NetworkError('Could not reach the server')
    }),
  })

  renderProvider(api)
  await waitFor(() => expect(api.push).toHaveBeenCalledTimes(1))

  await wait(150) // the automatic check runs every 30 ms, but the back-off holds it back
  expect(api.push).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
  await waitFor(() => expect(api.push).toHaveBeenCalledTimes(2))
})