import { db } from '../db/db'

// Compares this device's stock with the server's, item by item. Differences are
// reported, never "fixed" automatically.
export async function compareStock(api) {
  const { items } = await api.stockLevels()
  const server = new Map(items.map((item) => [item.variantId, item]))
  const local = await db.variants.toArray()

  const mismatches = []
  for (const variant of local) {
    const remote = server.get(variant.id)
    if (!remote) {
      mismatches.push({
        variantId: variant.id,
        sku: variant.sku,
        local: variant.currentStock,
        server: null,
      })
    } else if (remote.currentStock !== variant.currentStock) {
      mismatches.push({
        variantId: variant.id,
        sku: variant.sku,
        local: variant.currentStock,
        server: remote.currentStock,
      })
    }
  }

  const localIds = new Set(local.map((variant) => variant.id))
  const onlyOnServer = items
    .filter((item) => !localIds.has(item.variantId))
    .map((item) => ({
      variantId: item.variantId,
      sku: item.sku,
      server: item.currentStock,
    }))

  return { checked: local.length, mismatches, onlyOnServer }
}
