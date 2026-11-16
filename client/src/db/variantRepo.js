import { db } from './db.js'
import { variantCreateSchema, variantEditSchema, validate } from './schemas.js'
import { getSettings } from './settingsRepo.js'
import { AppError } from '../lib/errors.js'
import { newId } from '../lib/id.js'

const MOVEMENT_TYPES = ['opening', 'sale', 'purchase', 'return', 'adjustment']
const BARCODE_PREFIX = 'CLO'

// For messages: pieces as a number, meters (stored as centimetres) as "2.35 m".
function showQuantity(variant, quantity) {
  return variant.unit === 'meter'
    ? `${(quantity / 100).toFixed(2)} m`
    : String(quantity)
}

// Hands out the next unused internal barcodes (CLO000001, CLO000002...).
// Must run inside a transaction that includes db.settings and db.variants.
export async function takeBarcodes(count) {
  const row = await db.settings.get('barcodeCounter')
  let counter = row?.value ?? 0
  const codes = []
  while (codes.length < count) {
    counter += 1
    const code = `${BARCODE_PREFIX}${String(counter).padStart(6, '0')}`
    if (await db.variants.where('barcode').equals(code).first()) continue
    codes.push(code)
  }
  await db.settings.put({ key: 'barcodeCounter', value: counter })
  return codes
}

// Creates one stock entry (an item with its own barcode, stock, cost and price).
// There is NO duplicate check on size or SKU: the same product and size can be
// entered as many times as you like. Only the barcode must be unique.
// Without a barcode, the next internal one is made automatically.
export async function createVariant(input, { reason = 'Opening stock' } = {}) {
  const typedBarcode = String(input.barcode ?? '').trim()
  const data = validate(variantCreateSchema, {
    unit: 'piece',
    taxRatePercent: 0,
    priceIncludesTax: true,
    reorderThreshold: 0,
    openingStock: 0,
    ...input,
    mrpPaise: input.mrpPaise ?? input.sellingPricePaise,
    barcode: typedBarcode || undefined,
  })

  let variant
  try {
    await db.transaction(
      'rw',
      db.products,
      db.variants,
      db.stockMovements,
      db.settings,
      async () => {
        if (!(await db.products.get(data.productId))) {
          throw new AppError('NOT_FOUND', 'Product not found')
        }

        let barcode = data.barcode
        if (barcode) {
          if (await db.variants.where('barcode').equals(barcode).first()) {
            throw new AppError(
              'DUPLICATE_BARCODE',
              `Barcode "${barcode}" is already used`,
            )
          }
        } else {
          barcode = (await takeBarcodes(1))[0]
        }

        const { openingStock, ...fields } = data
        const now = new Date().toISOString()
        variant = {
          id: newId(),
          ...fields,
          barcode,
          sku: fields.sku || barcode,
          currentStock: openingStock,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }
        await db.variants.add(variant)

        if (openingStock > 0) {
          await db.stockMovements.add({
            id: newId(),
            variantId: variant.id,
            type: 'opening',
            quantityChange: openingStock,
            stockAfter: openingStock,
            reason,
            referenceId: null,
            createdAt: now,
          })
        }
      },
    )
  } catch (err) {
    // Safety net: the database's own unique index on the barcode fired.
    if (err.name === 'ConstraintError') {
      throw new AppError('DUPLICATE_BARCODE', 'That barcode is already used')
    }
    throw err
  }
  return variant
}

export function getVariant(id) {
  return db.variants.get(id)
}

export async function getVariantByBarcode(barcode) {
  return db.variants.where('barcode').equals(String(barcode).trim()).first()
}

export function listVariantsByProduct(productId) {
  return db.variants.where('productId').equals(productId).toArray()
}

export async function updateVariant(id, changes) {
  const existing = await db.variants.get(id)
  if (!existing) throw new AppError('NOT_FOUND', 'Variant not found')

  // The unit (piece or meter) can never change after the item is created: its stock
  // numbers would stop making sense. Whatever is passed in is ignored.
  const unit = existing.unit ?? 'piece'

  // zod strips fields it does not know (like currentStock), so stock cannot
  // be changed through this function even if someone passes it in.
  const data = validate(variantEditSchema, { ...existing, ...changes, unit })
  const updated = {
    ...existing,
    ...data,
    sku: data.sku || existing.sku || data.barcode,
    unit,
    updatedAt: new Date().toISOString(),
  }

  try {
    await db.variants.put(updated)
  } catch (err) {
    if (err.name === 'ConstraintError') {
      throw new AppError('DUPLICATE_BARCODE', 'That barcode is already used')
    }
    throw err
  }
  return updated
}

// An archived entry can no longer be sold. Its history stays.
export async function archiveVariant(id) {
  const existing = await db.variants.get(id)
  if (!existing) throw new AppError('NOT_FOUND', 'Variant not found')
  await db.variants.update(id, {
    status: 'archived',
    updatedAt: new Date().toISOString(),
  })
}

// The ONLY way stock changes. Stock update + movement record happen together.
// Call it inside a bigger db.transaction (sales) and it joins that one.
export async function adjustStock({
  variantId,
  quantityChange,
  type,
  reason = '',
  referenceId = null,
}) {
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Quantity change must be a non-zero whole number',
    )
  }
  if (!MOVEMENT_TYPES.includes(type)) {
    throw new AppError('VALIDATION_ERROR', `Unknown movement type "${type}"`)
  }
  if (type === 'adjustment' && !reason.trim()) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A reason is required for stock adjustments',
    )
  }

  return db.transaction(
    'rw',
    db.variants,
    db.stockMovements,
    db.settings,
    async () => {
      const variant = await db.variants.get(variantId)
      if (!variant) throw new AppError('NOT_FOUND', 'Variant not found')

      const { allowNegativeStock } = await getSettings()
      const newStock = variant.currentStock + quantityChange
      if (newStock < 0 && !allowNegativeStock) {
        throw new AppError(
          'NEGATIVE_STOCK',
          `Only ${showQuantity(variant, variant.currentStock)} in stock for ${variant.sku || variant.barcode}`,
        )
      }

      const now = new Date().toISOString()
      await db.variants.update(variantId, {
        currentStock: newStock,
        updatedAt: now,
      })
      await db.stockMovements.add({
        id: newId(),
        variantId,
        type,
        quantityChange,
        stockAfter: newStock,
        reason: reason.trim(),
        referenceId,
        createdAt: now,
      })
      return newStock
    },
  )
}

// Creates the next unused internal barcode, e.g. CLO000001.
// This is an internal code for your own shop, not a GS1 EAN.
// Gaps in the numbers are fine.
export async function generateBarcode() {
  return db.transaction(
    'rw',
    db.settings,
    db.variants,
    async () => (await takeBarcodes(1))[0],
  )
}
