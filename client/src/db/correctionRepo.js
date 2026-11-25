import { createCart, lineFromVariant } from '../billing/cart.js'
import { AppError } from '../lib/errors.js'
import { db } from './db.js'
import { createSale, getSale } from './saleRepo.js'
import { adjustStock } from './variantRepo.js'

export const CANCEL_REASONS = [
  'Wrong item or size',
  'Wrong price',
  'Wrong quantity',
  'Discount changed',
  'Payment method changed',
  'Other',
]

// Opens a saved bill as a draft cart for correction. Prices, tax and discounts are
// the ones on the old bill, not today's catalogue.
export async function buildCorrectionCart(saleId) {
  const data = await getSale(saleId)
  if (!data) throw new AppError('NOT_FOUND', 'Bill not found')
  if (data.sale.status !== 'completed') {
    throw new AppError(
      'NOT_CORRECTABLE',
      `${data.sale.invoiceNumber} is cancelled and cannot be corrected`,
    )
  }

  const lines = []
  for (const item of data.items) {
    const variant = await db.variants.get(item.variantId)
    const product = variant ? await db.products.get(variant.productId) : null
    if (!variant || !product) {
      throw new AppError(
        'ITEM_UNAVAILABLE',
        `${item.productName} (size ${item.size}) no longer exists, so this bill cannot be corrected here`,
      )
    }
    lines.push({
      ...lineFromVariant(variant, product),
      quantity: item.quantity,
      unitPricePaise: item.unitPricePaise,
      mrpPaise: item.mrpPaise,
      taxRatePercent: item.taxRatePercent,
      priceIncludesTax: item.priceIncludesTax,
      discount: item.discount ?? null,
      discountExcluded: item.discountExcluded === true,
    })
  }

  return {
    sale: data.sale,
    cart: {
      ...createCart(),
      lines,
      billDiscount: data.sale.billDiscount ?? null,
    },
  }
}

// Cancels the old bill, puts its stock back, and saves the corrected bill as a NEW
// invoice. All in ONE transaction: it all happens, or nothing does.
// `newSaleId` is the idempotency key: repeating the call changes nothing more.
export async function correctSale({
  oldSaleId,
  newSaleId,
  reason,
  cart,
  payment,
}) {
  if (typeof newSaleId !== 'string' || !newSaleId) {
    throw new AppError('VALIDATION_ERROR', 'A new bill id is required')
  }
  const why = String(reason ?? '').trim()
  if (!why) throw new AppError('VALIDATION_ERROR', 'A reason is required')
  if (why.length > 80)
    throw new AppError(
      'VALIDATION_ERROR',
      'The reason is too long (80 characters at most)',
    )

  return db.transaction(
    'rw',
    db.sales,
    db.saleItems,
    db.variants,
    db.stockMovements,
    db.settings,
    async () => {
      const old = await db.sales.get(oldSaleId)
      if (!old)
        throw new AppError('NOT_FOUND', 'The original bill was not found')

      if (old.status === 'cancelled') {
        if (old.replacedBySaleId === newSaleId) {
          const again = await getSale(newSaleId)
          return { ...again, oldSale: old, duplicate: true }
        }
        throw new AppError(
          'ALREADY_CANCELLED',
          `${old.invoiceNumber} has already been cancelled`,
        )
      }
      if (old.status !== 'completed') {
        throw new AppError(
          'NOT_CORRECTABLE',
          `${old.invoiceNumber} cannot be corrected`,
        )
      }

      // 1. Put the old stock back, so the new bill is checked against the true stock.
      const oldItems = await db.saleItems
        .where('saleId')
        .equals(oldSaleId)
        .toArray()
      for (const item of oldItems) {
        await adjustStock({
          variantId: item.variantId,
          quantityChange: item.quantity,
          type: 'adjustment',
          reason: `Bill ${old.invoiceNumber} cancelled (correction)`,
          referenceId: oldSaleId,
        })
      }

      // 2. Save the corrected bill with a new invoice number (and take its stock).
      const created = await createSale({ id: newSaleId, cart, payment })
      if (created.duplicate) {
        throw new AppError(
          'VALIDATION_ERROR',
          'That new bill id is already used',
        )
      }

      // 3. Cancel the old bill and link the two bills.
      const now = new Date().toISOString()
      await db.sales.update(oldSaleId, {
        status: 'cancelled',
        cancelledAt: now,
        cancelReason: why,
        replacedBySaleId: newSaleId,
        replacedByInvoice: created.sale.invoiceNumber,
        cancelPending: 1, // the server still has to be told
      })
      await db.sales.update(newSaleId, {
        replacesSaleId: oldSaleId,
        replacesInvoice: old.invoiceNumber,
      })

      const result = await getSale(newSaleId)
      return {
        ...result,
        oldSale: await db.sales.get(oldSaleId),
        duplicate: false,
      }
    },
  )
}
