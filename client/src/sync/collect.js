import { db } from '../db/db'
import { getCursor, getVariantHashes } from './cursors'
import {
  movementOp,
  productOp,
  saleCancelOp,
  saleOp,
  salePaymentOp,
  variantOp,
} from './ops'

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)

const saleKey = (sale) => `${sale.createdAt}|${sale.id}`
const bySaleKey = (a, b) => {
  const x = saleKey(a)
  const y = saleKey(b)
  return x < y ? -1 : x > y ? 1 : 0
}

// Bills already on the server whose payment was recorded or changed afterwards.
// (A bill that is not on the server yet carries its payment inside its own operation.)
const paymentSales = () =>
  db.sales
    .where('paymentPending')
    .equals(1)
    .filter((sale) => sale.syncStatus === 'synced')

// Bills already on the server that were cancelled afterwards.
const cancelledSales = () =>
  db.sales
    .where('cancelPending')
    .equals(1)
    .filter(
      (sale) => sale.syncStatus === 'synced' && sale.status === 'cancelled',
    )

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
// products, then items, then stock changes, then new bills, then payments recorded
// later, then cancellations. Oldest first within each.
export async function collectPending() {
  const { products, variants, movements } = await pendingCatalogAndStock()

  const sales = (
    await db.sales.where('syncStatus').equals('pending').toArray()
  ).sort(bySaleKey)
  const saleOps = []
  for (const sale of sales) {
    const items = await db.saleItems.where('saleId').equals(sale.id).toArray()
    saleOps.push(saleOp(sale, items))
  }

  const paymentOps = (await paymentSales().toArray())
    .sort(bySaleKey)
    .map(salePaymentOp)
  const cancelOps = (await cancelledSales().toArray())
    .sort(bySaleKey)
    .map(saleCancelOp)

  return [
    ...products,
    ...variants,
    ...movements,
    ...saleOps,
    ...paymentOps,
    ...cancelOps,
  ]
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
  const payments = await paymentSales().count()
  const cancels = await cancelledSales().count()
  const attention = await db.syncQueue.where('status').equals('open').count()
  return {
    products: products.length,
    variants: variants.length,
    movements: movements.length,
    sales,
    payments,
    cancels,
    total:
      products.length +
      variants.length +
      movements.length +
      sales +
      payments +
      cancels,
    attention,
  }
}
