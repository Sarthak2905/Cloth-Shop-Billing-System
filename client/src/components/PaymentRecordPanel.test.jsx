import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../db/db'
import { createSale, getSale } from '../db/saleRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import { clearDb, makeItem } from '../test-utils/correctionFixtures'
import PaymentRecordPanel from './PaymentRecordPanel'

beforeEach(clearDb)

async function pendingSale() {
    const { product, variant } = await makeItem({ price: 51000 })
    let cart = createCart()
    cart = addItem(cart, lineFromVariant(variant, product)).cart
    cart = addItem(cart, lineFromVariant(variant, product)).cart
    return (await createSale({ id: newId(), cart })).sale
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

test('records a split payment and says it is only for the shop', async () => {
    const sale = await pendingSale()
    const onSaved = vi.fn()
    render(<PaymentRecordPanel sale={sale} onSaved={onSaved} />)

    expect(screen.getByText('Record payment')).toBeInTheDocument()
    expect(screen.getByText(/never printed on the customer/)).toBeInTheDocument()

    type('Cash', '500')
    type('UPI', '520')
    expect(screen.getByText('Received ₹1,020.00 · Exact')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))

    expect(await screen.findByText('Payment recorded')).toBeInTheDocument()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect((await getSale(sale.id)).sale).toMatchObject({ paymentStatus: 'paid', receivedPaise: 102000 })
})

test('a bargain: ₹1,000 for a ₹1,020 bill is saved with the short amount', async () => {
    const sale = await pendingSale()
    render(<PaymentRecordPanel sale={sale} />)

    type('Cash', '1000')
    expect(screen.getByText('Received ₹1,000.00 · Short ₹20.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))

    await screen.findByText('Payment recorded')
    expect((await getSale(sale.id)).sale).toMatchObject({ receivedPaise: 100000, shortPaise: 2000 })
})

test('"Cash = bill total" fills the box, and a wrong amount blocks saving', async () => {
    const sale = await pendingSale()
    render(<PaymentRecordPanel sale={sale} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cash = bill total' }))
    expect(screen.getByLabelText('Cash')).toHaveValue('1020.00')

    type('Card', 'abc')
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the Card amount')
    expect((await getSale(sale.id)).sale.paymentStatus).toBe('pending')
})

test('an already paid bill opens with its payment filled in, as "Change payment"', async () => {
    const sale = await pendingSale()
    await db.sales.update(sale.id, {
        paymentStatus: 'paid',
        payments: [{ method: 'cash', amountPaise: 100000, reference: '' }],
        receivedPaise: 100000,
        shortPaise: 2000,
        payment: { method: 'cash', amountTenderedPaise: 100000, changePaise: 0, reference: '' },
    })
    const stored = (await getSale(sale.id)).sale
    render(<PaymentRecordPanel sale={stored} />)

    expect(screen.getByText('Change payment')).toBeInTheDocument()
    expect(screen.getByLabelText('Cash')).toHaveValue('1000.00')
})