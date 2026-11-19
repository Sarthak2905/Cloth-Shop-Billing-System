import { db } from '../db/db'

// How this computer's data stands: is there anything on it, and did it ever sync?
export async function deviceState() {
  const [products, sales, synced] = await Promise.all([
    db.products.count(),
    db.sales.count(),
    db.settings.get('sync.lastSuccessAt'),
  ])
  return {
    products,
    sales,
    synced: Boolean(synced),
    empty: products === 0 && sales === 0 && !synced,
  }
}

export async function localCounts() {
  const [products, sales] = await Promise.all([
    db.products.count(),
    db.sales.count(),
  ])
  return { products, sales }
}

// True when the server has no shop data at all.
export const serverIsEmpty = (counts) =>
  ['products', 'variants', 'sales', 'movements'].every(
    (kind) => !counts?.[kind],
  )

// Removes everything from this computer, in one step: all of it, or none of it.
export async function wipeDeviceData() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}
