import { db } from './db.js'
import { variantCreateSchema, variantEditSchema, validate } from './schemas.js'
import { getSettings } from './settingsRepo.js'
import { AppError } from '../lib/errors.js'
import { newId } from '../lib/id.js'

const MOVEMENT_TYPES = ['opening', 'sale', 'purchase', 'return', 'adjustment']

export async function createVariant(input) {
  const data = validate(variantCreateSchema, {
    taxRatePercent: 0,
    priceIncludesTax: true,
    reorderThreshold: 0,
    openingStock: 0,
    ...input,
  })
  const { openingStock, ...fields } = data
  const now = new Date().toISOString()
  const variant = {
    id: newId(),
    ...fields,
    currentStock: openingStock,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  try {
    await db.transaction(
      'rw',
      db.products,
      db.variants,
      db.stockMovements,
      async () => {
        if (!(await db.products.get(fields.productId))) {
          throw new AppError('NOT_FOUND', 'Product not found')
        }
        if (await db.variants.where('barcode').equals(fields.barcode).first()) {
          throw new AppError(
            'DUPLICATE_BARCODE',
            `Barcode "${fields.barcode}" is already used`,
          )
        }
        if (await db.variants.where('sku').equals(fields.sku).first()) {
          throw new AppError(
            'DUPLICATE_SKU',
            `SKU "${fields.sku}" is already used`,
          )
        }
        const sameSize = await db.variants
          .where('[productId+size]')
          .equals([fields.productId, fields.size])
          .first()
        if (sameSize) {
          throw new AppError(
            'DUPLICATE_VARIANT',
            `This product already has size ${fields.size}`,
          )
        }

        await db.variants.add(variant)

        if (openingStock > 0) {
          await db.stockMovements.add({
            id: newId(),
            variantId: variant.id,
            type: 'opening',
            quantityChange: openingStock,
            stockAfter: openingStock,
            reason: 'Opening stock',
            referenceId: null,
            createdAt: now,
          })
        }
      },
    )
  } catch (err) {
    // Safety net: the database's own unique index fired.
    if (err.name === 'ConstraintError') {
      throw new AppError(
        'DUPLICATE_VARIANT',
        'A variant with these details already exists',
      )
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

  // zod strips fields it does not know (like currentStock), so stock cannot
  // be changed through this function even if someone passes it in.
  const data = validate(variantEditSchema, { ...existing, ...changes })
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }

  try {
    await db.variants.put(updated)
  } catch (err) {
    if (err.name === 'ConstraintError') {
      throw new AppError(
        'DUPLICATE_BARCODE',
        'Barcode, SKU or size already exists',
      )
    }
    throw err
  }
  return updated
}

// The ONLY way stock changes. Stock update + movement record happen together.
// Call it inside a bigger db.transaction (Phase 6 sales) and it joins that one.
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
          `Only ${variant.currentStock} in stock for ${variant.sku}`,
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

const BARCODE_PREFIX = 'CLO'

// Creates the next unused internal barcode, e.g. CLO000001.
// This is an internal code for your own shop, not a GS1 EAN.
// Gaps in the numbers are fine (pressing Generate without saving uses a number).
export async function generateBarcode() {
  return db.transaction('rw', db.settings, db.variants, async () => {
    const row = await db.settings.get('barcodeCounter')
    let counter = row?.value ?? 0
    let code
    do {
      counter += 1
      code = `${BARCODE_PREFIX}${String(counter).padStart(6, '0')}`
    } while (await db.variants.where('barcode').equals(code).first())
    await db.settings.put({ key: 'barcodeCounter', value: counter })
    return code
  })
}
