import { db } from '../db/db'
import { isStorageFull } from '../lib/storageErrors'
import { AppError } from '../lib/errors'
import { newId } from '../lib/id'

const BARCODE_PREFIX = 'CLO'

// Saves a checked plan. Everything is saved in ONE transaction: if anything fails,
// nothing is saved. Stock is only ever created as an "opening" stock record.
export async function applyImport(plan) {
  const ready = plan.ready
  const empty = {
    productsCreated: 0,
    variantsCreated: 0,
    addedToExisting: 0,
    barcodesGenerated: 0,
  }
  if (ready.length === 0) return empty

  const now = new Date().toISOString()
  const groups = new Map()
  for (const item of ready) {
    if (!groups.has(item.key)) groups.set(item.key, [])
    groups.get(item.key).push(item)
  }

  try {
    return await db.transaction(
      'rw',
      db.products,
      db.variants,
      db.stockMovements,
      db.settings,
      async () => {
        // 1. One new product for each new name + category + brand.
        const productIds = new Map()
        const newProducts = []
        for (const [key, items] of groups) {
          const first = items[0]
          if (first.existingProductId) {
            productIds.set(key, first.existingProductId)
            continue
          }
          const id = newId()
          productIds.set(key, id)
          newProducts.push({
            id,
            name: first.product.name,
            category: first.product.category,
            brand: first.product.brand,
            supplier: first.product.supplier,
            discountAllowed: items.every((i) => i.discountAllowed),
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
        }
        if (newProducts.length > 0) await db.products.bulkAdd(newProducts)

        // 2. Internal barcodes (CLO000001...) for rows that came without one.
        const used = new Set(
          ready.map((r) => r.variant.barcode).filter(Boolean),
        )
        const counterRow = await db.settings.get('barcodeCounter')
        let counter = counterRow?.value ?? 0
        let generated = 0
        const nextBarcode = async () => {
          for (;;) {
            counter += 1
            const code = `${BARCODE_PREFIX}${String(counter).padStart(6, '0')}`
            if (used.has(code)) continue
            if (await db.variants.where('barcode').equals(code).first())
              continue
            used.add(code)
            generated += 1
            return code
          }
        }

        // 3. The items (one product + one size each) and their opening stock records.
        const variants = []
        const movements = []
        for (const item of ready) {
          const v = item.variant
          const id = newId()
          const barcode = v.barcode ?? (await nextBarcode())
          variants.push({
            id,
            productId: productIds.get(item.key),
            sku: v.sku,
            barcode,
            size: v.size,
            costPaise: v.costPaise,
            mrpPaise: v.mrpPaise,
            sellingPricePaise: v.sellingPricePaise,
            taxRatePercent: v.taxRatePercent,
            priceIncludesTax: v.priceIncludesTax,
            currentStock: v.openingStock,
            reorderThreshold: v.reorderThreshold,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
          if (v.openingStock > 0) {
            movements.push({
              id: newId(),
              variantId: id,
              type: 'opening',
              quantityChange: v.openingStock,
              stockAfter: v.openingStock,
              reason: 'Opening stock (import)',
              referenceId: null,
              createdAt: now,
            })
          }
        }
        await db.variants.bulkAdd(variants)
        if (movements.length > 0) await db.stockMovements.bulkAdd(movements)
        await db.settings.put({ key: 'barcodeCounter', value: counter })

        return {
          productsCreated: newProducts.length,
          variantsCreated: variants.length,
          addedToExisting: new Set(
            ready
              .filter((r) => r.existingProductId)
              .map((r) => r.existingProductId),
          ).size,
          barcodesGenerated: generated,
        }
      },
    )
  } catch (err) {
    console.error(err)
    if (isStorageFull(err)) {
      throw new AppError(
        'STORAGE_FULL',
        'Nothing was imported: the device storage is full.',
      )
    }
    throw new AppError(
      'IMPORT_FAILED',
      'Nothing was imported because something changed while saving (for example a barcode or SKU was used meanwhile). Please upload the file again.',
    )
  }
}
