import { db } from './db'
import { getSale } from './saleRepo'
import { clearDb, makeItem, sellItem } from '../test-utils/correctionFixtures'
import { saleOp } from '../sync/ops'

beforeEach(clearDb)

test('each bill item keeps what the item cost when it was sold, even if the cost changes later', async () => {
  const item = await makeItem({ stock: 10 })
  await db.variants.update(item.variant.id, { costPaise: 32000 })
  const first = await sellItem(item, 1)

  await db.variants.update(item.variant.id, { costPaise: 40000 })
  const second = await sellItem(item, 1)

  expect((await getSale(first.id)).items[0].costPaise).toBe(32000)
  expect((await getSale(second.id)).items[0].costPaise).toBe(40000)
})

test('the cost goes to the server with the bill', async () => {
  const item = await makeItem({ stock: 10 })
  await db.variants.update(item.variant.id, { costPaise: 32000 })
  const sale = await sellItem(item, 1)

  const { sale: saved, items } = await getSale(sale.id)

  expect(saleOp(saved, items).data.lines[0].costPaise).toBe(32000)
})
