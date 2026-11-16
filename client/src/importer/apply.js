import { db } from '../db/db'
import { takeBarcodes } from '../db/variantRepo'
import { isStorageFull } from '../lib/storageErrors'
import { AppError } from '../lib/errors'
import { newId } from '../lib/id'
import { addImportRecord } from './importLog'

// The low-stock alert starts at 3 pieces, or at 3.00 m (300 cm) for fabric.
const LOW_STOCK = { piece: 3, meter: 300 }

// Saves a checked plan. Everything is saved in ONE transaction: if anything fails,
// nothing is saved. Every row becomes its own entry with its own automatic barcode
// and an "opening" stock record. Fabric quantities are whole centimetres.
export async function applyImport(
  plan,
  { fingerprint = null, fileName = '' } = {},
) {
  const ready = plan.ready
  if (ready.length === 0) {
    return {
      productsCreated: 0,
      entriesCreated: 0,
      addedToExisting: 0,
      entries: [],
    }
  }

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
        // 1. One product for each name + company + category + unit (new, or the one that exists).
        const productIds = new Map()
        let productsCreated = 0
        for (const [key, items] of groups) {
          const first = items[0]
          if (first.existingProductId) {
            if (!(await db.products.get(first.existingProductId))) {
              throw new AppError(
                'IMPORT_FAILED',
                'Nothing was imported: a product in the file was removed meanwhile. Please upload the file again.',
              )
            }
            productIds.set(key, first.existingProductId)
            continue
          }
          const id = newId()
          productIds.set(key, id)
          productsCreated += 1
          await db.products.add({
            id,
            name: first.product.name,
            category: first.product.category,
            brand: first.product.brand,
            supplier: '',
            discountAllowed: items.every((i) => i.discountAllowed),
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
        }

        // 2. One automatic barcode for each row, in the order of the file.
        const barcodes = await takeBarcodes(ready.length)

        // 3. The entries and their opening stock records.
        const variants = []
        const movements = []
        ready.forEach((item, index) => {
          const v = item.variant
          const id = newId()
          variants.push({
            id,
            productId: productIds.get(item.key),
            barcode: barcodes[index],
            sku: barcodes[index],
            size: v.size,
            unit: v.unit,
            costPaise: v.costPaise,
            mrpPaise: v.mrpPaise,
            sellingPricePaise: v.sellingPricePaise,
            taxRatePercent: v.taxRatePercent,
            priceIncludesTax: v.priceIncludesTax,
            currentStock: v.quantity,
            reorderThreshold: LOW_STOCK[v.unit],
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
          movements.push({
            id: newId(),
            variantId: id,
            type: 'opening',
            quantityChange: v.quantity,
            stockAfter: v.quantity,
            reason: 'Stock entry (import)',
            referenceId: null,
            createdAt: now,
          })
        })
        await db.variants.bulkAdd(variants)
        await db.stockMovements.bulkAdd(movements)

        // 4. Remember the file, so importing it again can be warned about.
        if (fingerprint) {
          const sum = (unit) =>
            variants
              .filter((v) => v.unit === unit)
              .reduce((total, v) => total + v.currentStock, 0)
          await addImportRecord({
            fingerprint,
            fileName,
            importedAt: now,
            entries: variants.length,
            pieces: sum('piece'),
            meters: sum('meter'), // centimetres
          })
        }

        return {
          productsCreated,
          entriesCreated: variants.length,
          addedToExisting: new Set(
            ready
              .filter((r) => r.existingProductId)
              .map((r) => r.existingProductId),
          ).size,
          entries: variants.map((v) => ({
            id: v.id,
            stock: v.currentStock,
            unit: v.unit,
          })),
        }
      },
    )
  } catch (err) {
    if (err instanceof AppError) throw err
    console.error(err)
    if (isStorageFull(err)) {
      throw new AppError(
        'STORAGE_FULL',
        'Nothing was imported: the device storage is full.',
      )
    }
    throw new AppError(
      'IMPORT_FAILED',
      'Nothing was imported because something went wrong while saving. Please upload the file again.',
    )
  }
}
