import { db } from './db.js'
import { createProduct } from './productRepo.js'
import { productInputSchema, validate } from './schemas.js'
import { createVariant } from './variantRepo.js'
import { AppError } from '../lib/errors.js'
import { productKey } from '../lib/productKey.js'

// Saves stock entries: one row = one entry with its own barcode, stock, cost and price.
// - The same product and size can be entered again and again. Nothing is blocked.
// - Entries of the same name + category + company share one product card.
// - All rows are saved together, or nothing is saved.
// rows: [{ size, quantity, costPaise, sellingPricePaise, mrpPaise }]
export async function addStockEntries({
  name,
  category = '',
  brand = '',
  supplier = '',
  taxRatePercent = 5,
  priceIncludesTax = true,
  rows,
}) {
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
      let product = active.find(
        (p) => productKey(p.name, p.category, p.brand) === key,
      )
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
              reorderThreshold: row.reorderThreshold ?? 3,
              openingStock: row.quantity,
              unit: row.unit ?? 'piece',
            },
            { reason: 'Stock entry' },
          ),
        )
      }
      return { product, entries }
    },
  )
}
