import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { updateSettings } from '../db/settingsRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import { printReceipt } from './printService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('the receipt language chosen in Settings is used when none is given', async () => {
  await seedSampleData()
  const variant = (await db.variants.toArray())[0]
  const product = await db.products.get(variant.productId)
  const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
  const { sale } = await createSale({
    id: newId(),
    cart,
    payment: { method: 'cash' },
  })
  await updateSettings({ receiptLanguage: 'mr' })

  const captured = []
  const printer = {
    id: 'test',
    label: 'Test printer',
    async print(receipt) {
      captured.push(receipt)
      return { confirmation: 'handed_off' }
    },
  }

  await printReceipt({ saleId: sale.id, printer })

  expect(captured[0].document.language).toBe('mr')
  expect(captured[0].text).toContain('एकूण')
  expect((await db.printJobs.toArray())[0].language).toBe('mr')
})
