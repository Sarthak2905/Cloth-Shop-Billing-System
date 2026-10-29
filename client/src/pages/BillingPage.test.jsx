import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { addItem, createCart, lineFromVariant, setBillDiscount } from '../billing/cart'
import { calculateTotals } from '../billing/calc'
import { formatINR } from '../lib/money'
import BillingPage from './BillingPage'

function renderPage() {
    return render(
        <MemoryRouter>
            <BillingPage />
        </MemoryRouter>,
    )
}

async function pickVariant() {
    const variant = (await db.variants.toArray())[0]
    const product = await db.products.get(variant.productId)
    return { variant, product }
}

function addByBarcode(barcode) {
    fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: barcode } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to bill' }))
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await seedSampleData()
})

test('adding an item by barcode puts it on the bill with the right total', async () => {
    const { variant } = await pickVariant()
    renderPage()
    addByBarcode(variant.barcode)

    expect(await screen.findByTestId('cart-line')).toBeInTheDocument()
    expect(screen.getByTestId('bill-total')).toHaveTextContent(formatINR(variant.sellingPricePaise))
})

test('the 10% quick button applies and removes the discount', async () => {
    const { variant, product } = await pickVariant()
    const discounted = setBillDiscount(
        addItem(createCart(), lineFromVariant(variant, product)).cart,
        { type: 'percent', value: 10 },
    ).cart
    const expected = calculateTotals(discounted).totalPaise

    renderPage()
    addByBarcode(variant.barcode)
    await screen.findByTestId('cart-line')

    fireEvent.click(screen.getByRole('button', { name: '10% off' }))
    await waitFor(() =>
        expect(screen.getByTestId('bill-total')).toHaveTextContent(formatINR(expected)),
    )
    expect(screen.getByRole('button', { name: '10% off' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '10% off' }))
    await waitFor(() =>
        expect(screen.getByTestId('bill-total')).toHaveTextContent(
            formatINR(variant.sellingPricePaise),
        ),
    )
})

test('an unknown barcode shows an error and adds nothing', async () => {
    renderPage()
    addByBarcode('CLO999999')

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'No product found for barcode CLO999999',
    )
    expect(
        screen.getByText('The bill is empty. Scan a barcode or search for an item.'),
    ).toBeInTheDocument()
})

test('the quantity buttons change the quantity and the total', async () => {
    const { variant } = await pickVariant()
    renderPage()
    addByBarcode(variant.barcode)
    await screen.findByTestId('cart-line')

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    await waitFor(() => expect(screen.getByTestId('qty')).toHaveTextContent('2'))
    expect(screen.getByTestId('bill-total')).toHaveTextContent(
        formatINR(variant.sellingPricePaise * 2),
    )
})

test('searching for an item and tapping it adds it to the bill', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'jeans' } })

    const buttons = await screen.findAllByRole('button', { name: /Add Denim Jeans/ })
    fireEvent.click(buttons[0])

    expect(await screen.findAllByTestId('cart-line')).toHaveLength(1)
})

test('completing a cash sale saves it, clears the bill and shows the invoice number', async () => {
    const { variant } = await pickVariant()
    renderPage()
    addByBarcode(variant.barcode)
    await screen.findByTestId('cart-line')

    fireEvent.click(screen.getByRole('button', { name: 'Complete sale' }))

    const done = await screen.findByTestId('sale-complete')
    expect(done).toHaveTextContent('INV-000001')
    expect(screen.queryByTestId('cart-line')).not.toBeInTheDocument()

    expect(await db.sales.count()).toBe(1)
    const after = await db.variants.get(variant.id)
    expect(after.currentStock).toBe(variant.currentStock - 1)
})

test('cash below the total shows an error and saves nothing', async () => {
    const { variant } = await pickVariant()
    renderPage()
    addByBarcode(variant.barcode)
    await screen.findByTestId('cart-line')

    fireEvent.change(screen.getByLabelText('Cash received'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Complete sale' }))

    expect(await screen.findByText('Cash received is less than the total')).toBeInTheDocument()
    expect(screen.getByTestId('cart-line')).toBeInTheDocument()
    expect(await db.sales.count()).toBe(0)
})

test('pressing Complete sale twice quickly saves only one sale', async () => {
    const { variant } = await pickVariant()
    renderPage()
    addByBarcode(variant.barcode)
    await screen.findByTestId('cart-line')

    const button = screen.getByRole('button', { name: 'Complete sale' })
    fireEvent.click(button)
    fireEvent.click(button)

    await screen.findByTestId('sale-complete')
    expect(await db.sales.count()).toBe(1)
    const after = await db.variants.get(variant.id)
    expect(after.currentStock).toBe(variant.currentStock - 1)
})