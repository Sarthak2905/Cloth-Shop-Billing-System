import { db } from '../db/db'
import { getCursor, getVariantHashes } from './cursors'
import { movementOp, productOp, saleOp, variantOp } from './ops'

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

async function pendingCatalogAndStock() {
  const productCursor = await getCursor('product')
  const movementCursor = await getCursor('movement')
  const hashes = await getVariantHashes()

  const products = (await db.products.toArray())
    .map(productOp)
    .filter((op) => op.key > productCursor)
    .sort(byKey)

  // Only a change to an item's catalogue fields makes it pending. A stock change does not.
  const variants = (await db.variants.toArray())
    .map(variantOp)
    .filter((op) => hashes[op.entityId] !== op.fingerprint)
    .sort(byKey)

  // Sale movements are not sent: the server makes its own when it saves the sale.
  const movements = (await db.stockMovements.toArray())
    .filter((m) => m.type !== 'sale')
    .map(movementOp)
    .filter((op) => op.key > movementCursor)
    .sort(byKey)

  return { products, variants, movements }
}

// Everything waiting to be sent, in the order the server needs it:
// products, then items, then stock changes, then sales. Oldest first within each.
export async function collectPending() {
  const { products, variants, movements } = await pendingCatalogAndStock()

  const sales = await db.sales.where('syncStatus').equals('pending').toArray()
  const saleKey = (sale) => `${sale.createdAt}|${sale.id}`
  sales.sort((a, b) =>
    saleKey(a) < saleKey(b) ? -1 : saleKey(a) > saleKey(b) ? 1 : 0,
  )

  const saleOps = []
  for (const sale of sales) {
    const items = await db.saleItems.where('saleId').equals(sale.id).toArray()
    saleOps.push(saleOp(sale, items))
  }

  return [...products, ...variants, ...movements, ...saleOps]
}

export function chunk(list, size) {
  const batches = []
  for (let i = 0; i < list.length; i += size)
    batches.push(list.slice(i, i + size))
  return batches
}

export async function countPending() {
  const { products, variants, movements } = await pendingCatalogAndStock()
  const sales = await db.sales.where('syncStatus').equals('pending').count()
  const attention = await db.syncQueue.where('status').equals('open').count()
  return {
    products: products.length,
    variants: variants.length,
    movements: movements.length,
    sales,
    total: products.length + variants.length + movements.length + sales,
    attention,
  }
}
