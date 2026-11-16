import { db } from './db.js'
import { createProduct } from './productRepo.js'
import { productInputSchema, validate } from './schemas.js'
import { createVariant } from './variantRepo.js'
import { AppError } from '../lib/errors.js'
import { productKey } from '../lib/productKey.js'

// The low-stock alert starts at 3 pieces, or at 3.00 m (300 cm) for fabric.
const DEFAULT_LOW_STOCK = { piece: 3, meter: 300 }

// Saves stock entries: one row = one entry with its own barcode, stock, cost and price.
// - The same product and size can be entered again and again. Nothing is blocked.
// - Entries of the same name + category + company + unit share one product card.
//   A fabric (meter) and a garment (piece) with the same name are separate products,
//   so their stock numbers are never mixed.
// - All rows are saved together, or nothing is saved.
// rows: [{ size, quantity, costPaise, sellingPricePaise, mrpPaise }]
// For fabric (unit 'meter'), quantity is in whole CENTIMETRES and prices are per meter.
export async function addStockEntries({
  name,
  category = '',
  brand = '',
  supplier = '',
  taxRatePercent = 5,
  priceIncludesTax = true,
  unit = 'piece',
  rows,
}) {
  if (!['piece', 'meter'].includes(unit)) {
    throw new AppError('VALIDATION_ERROR', 'Sold by must be Piece or Meter')
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Add at least one size with its quantity and price',
    )
  }
  const productData = validate(productInputSchema, {
    name,
    category,
    brand,
    supplier,
  })

  return db.transaction(
    'rw',
    db.products,
    db.variants,
    db.stockMovements,
    db.settings,
    async () => {
      const key = productKey(
        productData.name,
        productData.category,
        productData.brand,
      )
      const active = await db.products
        .where('status')
        .equals('active')
        .toArray()

      let product = null
      for (const candidate of active) {
        if (
          productKey(candidate.name, candidate.category, candidate.brand) !==
          key
        )
          continue
        const variants = await db.variants
          .where('productId')
          .equals(candidate.id)
          .toArray()
        const units = new Set(variants.map((v) => v.unit ?? 'piece'))
        if (units.size === 0 || (units.size === 1 && units.has(unit))) {
          product = candidate
          break
        }
      }
      if (!product) product = await createProduct(productData)

      const entries = []
      for (const row of rows) {
        entries.push(
          await createVariant(
            {
              productId: product.id,
              size: row.size ?? '',
              costPaise: row.costPaise ?? 0,
              mrpPaise: row.mrpPaise ?? row.sellingPricePaise,
              sellingPricePaise: row.sellingPricePaise,
              taxRatePercent: row.taxRatePercent ?? taxRatePercent,
              priceIncludesTax,
              reorderThreshold: row.reorderThreshold ?? DEFAULT_LOW_STOCK[unit],
              openingStock: row.quantity,
              unit,
            },
            { reason: 'Stock entry' },
          ),
        )
      }
      return { product, entries }
    },
  )
}
