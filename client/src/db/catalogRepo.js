import { db } from './db.js'

// Returns active products with their active variants, filtered by a search text.
// Matches product name/brand/category, or any variant SKU/barcode.
// `unit` is 'piece' or 'meter'; totalStock is in that unit (centimetres for meters).
export async function searchProducts(query = '') {
  const q = query.trim().toLowerCase()
  const products = await db.products.where('status').equals('active').toArray()
  const variants = await db.variants.where('status').equals('active').toArray()

  const byProduct = new Map()
  for (const v of variants) {
    if (!byProduct.has(v.productId)) byProduct.set(v.productId, [])
    byProduct.get(v.productId).push(v)
  }

  const rows = products.map((product) => {
    const pv = byProduct.get(product.id) ?? []
    return {
      product,
      variants: pv,
      unit: pv[0]?.unit ?? 'piece',
      totalStock: pv.reduce((sum, v) => sum + v.currentStock, 0),
      lowStock: pv.some((v) => v.currentStock <= v.reorderThreshold),
    }
  })

  const matches = (row) => {
    if (!q) return true
    const { product } = row
    const inProduct = [product.name, product.brand, product.category].some(
      (t) => t.toLowerCase().includes(q),
    )
    const inVariants = row.variants.some(
      (v) =>
        v.sku.toLowerCase().includes(q) || v.barcode.toLowerCase().includes(q),
    )
    return inProduct || inVariants
  }

  return rows
    .filter(matches)
    .sort((a, b) => a.product.name.localeCompare(b.product.name))
}

// Active variants that belong to active products, with their product.
// Used by the scanner test page now and the billing screen later.
export async function listSellableVariants() {
  const products = await db.products.where('status').equals('active').toArray()
  const productById = new Map(products.map((p) => [p.id, p]))
  const variants = await db.variants.where('status').equals('active').toArray()

  return variants
    .filter((v) => productById.has(v.productId))
    .map((variant) => ({
      variant,
      product: productById.get(variant.productId),
    }))
    .sort(
      (a, b) =>
        a.product.name.localeCompare(b.product.name) ||
        a.variant.size.localeCompare(b.variant.size, undefined, {
          numeric: true,
        }),
    )
}
