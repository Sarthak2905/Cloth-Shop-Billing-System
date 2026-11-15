import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { updateSettings } from '../db/settingsRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import { PrinterError } from '../printing/printerAdapter'
import ReceiptPrintButton from './ReceiptPrintButton'

async function saveSale() {
    await seedSampleData()
    const variant = (await db.variants.toArray())[0]
    const product = await db.products.get(variant.productId)
    const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
    const { sale } = await createSale({ id: newId(), cart, payment: { method: 'cash' } })
    return sale
}

const fakePrinter = (print) => ({ id: 'fake', label: 'Fake printer', print })

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

test('pressing the button prints the saved receipt and records the job', async () => {
    const sale = await saveSale()
    const print = vi.fn(async () => ({ confirmation: 'handed_off' }))
    const printer = fakePrinter(print)
    const createPrinterFn = () => printer

    render(<ReceiptPrintButton saleId={sale.id} createPrinterFn={createPrinterFn} />)
    const button = await screen.findByRole('button', { name: 'Print receipt' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    expect(await screen.findByText('Sent to the printer.')).toBeInTheDocument()
    expect(print).toHaveBeenCalledTimes(1)
    expect(print.mock.calls[0][0].text).toContain(sale.invoiceNumber)
    expect(await db.printJobs.count()).toBe(1)
    expect(await db.sales.count()).toBe(1)
})

test('a printer problem is shown and the sale is kept', async () => {
    const sale = await saveSale()
    const printer = fakePrinter(async () => {
        throw new PrinterError('PAPER_OUT', 'The printer is out of paper. Add paper and try again.')
    })
    const createPrinterFn = () => printer

    render(<ReceiptPrintButton saleId={sale.id} createPrinterFn={createPrinterFn} />)
    const button = await screen.findByRole('button', { name: 'Print receipt' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent('out of paper')
    expect(await db.sales.count()).toBe(1)
})

test('with automatic printing on, the receipt prints once by itself', async () => {
    const sale = await saveSale()
    await updateSettings({ autoPrintReceipt: true })
    const print = vi.fn(async () => ({ confirmation: 'handed_off' }))
    const printer = fakePrinter(print)
    const createPrinterFn = () => printer

    const { rerender } = render(
        <ReceiptPrintButton saleId={sale.id} createPrinterFn={createPrinterFn} />,
    )
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))

    rerender(<ReceiptPrintButton saleId={sale.id} createPrinterFn={createPrinterFn} />)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(print).toHaveBeenCalledTimes(1)
})