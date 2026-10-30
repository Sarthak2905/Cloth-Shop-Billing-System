import { vi } from 'vitest'
import { db } from '../db/db'
import { createProduct } from '../db/productRepo'
import { createVariant, getVariant } from '../db/variantRepo'
import { createSale } from '../db/saleRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { createSimulatedPrinter } from './printerAdapter'
import { listPrintJobs, printReceipt } from './printService'

async function makeSale() {
  const product = await createProduct({
    name: 'Cotton Shirt',
    category: 'Shirts',
  })
  const variant = await createVariant({
    productId: product.id,
    sku: 'SHIRT-M',
    barcode: 'CLO000001',
    size: 'M',
    costPaise: 30000,
    mrpPaise: 99900,
    sellingPricePaise: 79900,
    taxRatePercent: 5,
    openingStock: 10,
  })
  const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
  const { sale } = await createSale({
    id: 'sale-1',
    cart,
    payment: { method: 'cash' },
  })
  return { sale, variant }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('a successful print is recorded and never changes the sale or stock', async () => {
  const { sale, variant } = await makeSale()
  const job = await printReceipt({
    saleId: sale.id,
    printer: createSimulatedPrinter('ok'),
  })

  expect(job).toMatchObject({
    status: 'completed',
    confirmation: 'simulated',
    isReprint: false,
  })
  expect((await db.printJobs.get(job.id)).status).toBe('completed')
  expect(await db.sales.count()).toBe(1)
  expect((await getVariant(variant.id)).currentStock).toBe(9)
})

test('a printer problem keeps the sale and records the failure', async () => {
  const { sale, variant } = await makeSale()
  const job = await printReceipt({
    saleId: sale.id,
    printer: createSimulatedPrinter('paper_out'),
  })

  expect(job.status).toBe('failed')
  expect(job.error).toContain('out of paper')
  expect(await db.sales.count()).toBe(1)
  expect(await db.saleItems.count()).toBe(1)
  expect((await getVariant(variant.id)).currentStock).toBe(9)
})

test('retrying after a failure works and is not counted as a reprint', async () => {
  const { sale } = await makeSale()
  await printReceipt({
    saleId: sale.id,
    printer: createSimulatedPrinter('offline'),
  })
  const retry = await printReceipt({
    saleId: sale.id,
    printer: createSimulatedPrinter('ok'),
  })

  expect(retry.status).toBe('completed')
  expect(retry.isReprint).toBe(false)
})

test('printing again after success is a reprint with a duplicate marker and no new sale', async () => {
  const { sale } = await makeSale()
  const captured = []
  const printer = {
    id: 'test',
    label: 'Test printer',
    async print(receipt) {
      captured.push(receipt)
      return { confirmation: 'handed_off' }
    },
  }

  const first = await printReceipt({ saleId: sale.id, printer })
  const second = await printReceipt({ saleId: sale.id, printer })

  expect(first.isReprint).toBe(false)
  expect(second.isReprint).toBe(true)
  expect(second.confirmation).toBe('handed_off')
  expect(captured[0].text).not.toContain('DUPLICATE COPY')
  expect(captured[1].text).toContain('DUPLICATE COPY')
  expect(await listPrintJobs(sale.id)).toHaveLength(2)
  expect(await db.sales.count()).toBe(1)
})

test('an unexpected printer error is recorded safely', async () => {
  const { sale } = await makeSale()
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const broken = {
    id: 'broken',
    label: 'Broken printer',
    async print() {
      throw new Error('boom')
    },
  }

  const job = await printReceipt({ saleId: sale.id, printer: broken })

  expect(job.status).toBe('failed')
  expect(job.error).toBe('The printer reported an unexpected problem.')
  expect(job.error).not.toContain('boom')
  spy.mockRestore()
})

test('printing a sale that does not exist is rejected', async () => {
  await expect(
    printReceipt({ saleId: 'missing', printer: createSimulatedPrinter('ok') }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
})
