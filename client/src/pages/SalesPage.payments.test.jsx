import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { createSale } from '../db/saleRepo'
import { newId } from '../lib/id'
import { clearDb, makeItem } from '../test-utils/correctionFixtures'
import SalesPage from './SalesPage'

beforeEach(clearDb)

async function sale(item, payments) {
    let cart = createCart()
    cart = addItem(cart, lineFromVariant(item.variant, item.product)).cart
    return (await createSale({ id: newId(), cart, payments })).sale
}

async function setup() {
    const a = await makeItem({ name: 'A', barcode: 'BC-0030', sku: 'S30', price: 51000 })
    const b = await makeItem({ name: 'B', barcode: 'BC-0031', sku: 'S31', price: 51000 })
    const c = await makeItem({ name: 'C', barcode: 'BC-0032', sku: 'S32', price: 51000 })
    await sale(a) // pending
    await sale(b, [{ method: 'cash', amountPaise: 50000 }]) // short ₹10
    await sale(c, [{ method: 'cash', amountPaise: 20000 }, { method: 'upi', amountPaise: 31000 }]) // split
    render(
        <MemoryRouter initialEntries={['/sales']}>
            <SalesPage />
        </MemoryRouter>,
    )
}

test('a bill waiting for payment has a badge, a short bill says so, a split bill lists both ways', async () => {
    await setup()

    expect(await screen.findByTestId('pending-badge')).toHaveTextContent('Payment pending')
    expect(screen.getByText(/Short ₹10.00/)).toBeInTheDocument()
    expect(screen.getByText(/Cash \+ UPI/)).toBeInTheDocument()
})

test('the "Payment pending" filter shows only the bills still to be paid', async () => {
    await setup()
    await screen.findByTestId('pending-badge')

    fireEvent.click(screen.getByRole('button', { name: 'Payment pending' }))

    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByText(/Cash \+ UPI/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getAllByRole('link')).toHaveLength(3)
})