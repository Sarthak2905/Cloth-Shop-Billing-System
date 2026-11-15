import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { clearDb, makeItem, sellItem } from '../test-utils/correctionFixtures'
import BillingPage from './BillingPage'

beforeEach(clearDb)

function renderCorrection(state) {
    return render(
        <MemoryRouter initialEntries={[{ pathname: '/billing', state }]}>
            <BillingPage />
        </MemoryRouter>,
    )
}

test('opens the old bill for correction and shows the difference to collect or refund', async () => {
    const item = await makeItem({ stock: 10 })
    const old = await sellItem(item, 2)

    renderCorrection({ correction: { saleId: old.id, reason: 'Wrong size', authorizedAt: Date.now() } })

    expect(await screen.findByTestId('correction-banner')).toHaveTextContent('Correcting INV-000001')
    expect(screen.getByTestId('correction-banner')).toHaveTextContent('Wrong size')
    expect(await screen.findByTestId('correction-difference')).toHaveTextContent('Same total as before')
})

test('saving cancels the old bill and shows the new invoice', async () => {
    const item = await makeItem({ stock: 10 })
    const old = await sellItem(item, 2)

    renderCorrection({ correction: { saleId: old.id, reason: 'Payment method changed', authorizedAt: Date.now() } })

    await screen.findByTestId('correction-banner')
    fireEvent.change(await screen.findByLabelText('Payment method'), { target: { value: 'upi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save corrected bill' }))

    const done = await screen.findByTestId('sale-complete')
    expect(done).toHaveTextContent('INV-000002')
    expect(done).toHaveTextContent('Replaces INV-000001')

    expect((await db.sales.get(old.id)).status).toBe('cancelled')
    expect((await db.variants.get(item.variant.id)).currentStock).toBe(8)
})

test('an old PIN approval is refused', async () => {
    const item = await makeItem()
    const old = await sellItem(item, 1)

    renderCorrection({
        correction: { saleId: old.id, reason: 'Wrong price', authorizedAt: Date.now() - 20 * 60 * 1000 },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('approval has expired')
    expect(screen.queryByTestId('correction-banner')).not.toBeInTheDocument()
})