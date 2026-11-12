import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SyncContext } from '../sync/SyncProvider'
import SyncBadge from './SyncBadge'

const counts = (over = {}) => ({
    products: 0,
    variants: 0,
    movements: 0,
    sales: 0,
    total: 0,
    attention: 0,
    ...over,
})

function renderBadge(over = {}) {
    const value = {
        signedIn: true,
        online: true,
        syncing: false,
        counts: counts(),
        lastSuccessAt: null,
        ...over,
    }
    return render(
        <MemoryRouter>
            <SyncContext.Provider value={value}>
                <SyncBadge />
            </SyncContext.Provider>
        </MemoryRouter>,
    )
}

test('says when this device is not connected to a server', () => {
    renderBadge({ signedIn: false })
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('Not synced to server')
})

test('shows how much is waiting and why it has not been sent', () => {
    const { unmount } = renderBadge({ counts: counts({ total: 3 }), online: false })
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('3 waiting to sync · offline')
    unmount()

    renderBadge({ counts: counts({ total: 2 }), signedIn: false })
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('2 waiting to sync · sign in')
})

test('attention comes first, then syncing', () => {
    const { unmount } = renderBadge({ counts: counts({ total: 4, attention: 2 }), syncing: true })
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('Needs attention (2)')
    unmount()

    renderBadge({ counts: counts({ total: 4 }), syncing: true })
    expect(screen.getByTestId('sync-badge')).toHaveTextContent('Syncing...')
})

test('shows all synced and links to the sync page', () => {
    renderBadge()
    const badge = screen.getByTestId('sync-badge')
    expect(badge).toHaveTextContent('All synced')
    expect(badge).toHaveAttribute('href', '/sync')
})