import { z } from 'zod'
import { db } from './db.js'
import { getSettings } from './settingsRepo.js'
import { adjustStock } from './variantRepo.js'
import { validate } from './schemas.js'
import { calculateTotals } from '../billing/calc.js'
import { AppError } from '../lib/errors.js'
import { newId } from '../lib/id.js'

const paymentSchema = z.object({
  method: z.enum(['cash', 'upi', 'card']),
  amountTenderedPaise: z.number().int().nonnegative().optional(),
  reference: z.string().trim().max(40).optional(),
})

// Saves a completed bill. `id` is the idempotency key: saving the same id again
// returns the existing sale and changes nothing.
export async function createSale({ id, cart, payment }) {
  if (typeof id !== 'string' || !id) {
    throw new AppError('VALIDATION_ERROR', 'A sale id is required')
  }
  const pay = validate(paymentSchema, payment ?? {})

  if (!cart?.lines?.length)
    throw new AppError('EMPTY_BILL', 'The bill is empty')
  for (const line of cart.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Every item needs a quantity of at least 1',
      )
    }
    if (!Number.isInteger(line.unitPricePaise) || line.unitPricePaise < 0) {
      throw new AppError('VALIDATION_ERROR', 'Every item needs a valid price')
    }
  }

  // Everything below is ONE transaction: it all saves, or none of it does.
  // Only database calls are awaited inside, so the transaction stays open.
  return db.transaction(
    'rw',
    db.sales,
    db.saleItems,
    db.variants,
    db.stockMovements,
    db.settings,
    async () => {
      const existing = await db.sales.get(id)
      if (existing) {
        const items = await db.saleItems.where('saleId').equals(id).toArray()
        items.sort((a, b) => a.lineNumber - b.lineNumber)
        return { sale: existing, items, duplicate: true }
      }

      for (const line of cart.lines) {
        const variant = await db.variants.get(line.variantId)
        if (!variant || variant.status !== 'active') {
          throw new AppError(
            'ITEM_UNAVAILABLE',
            `${line.productName} (size ${line.size}) is no longer available`,
          )
        }
      }

      const settings = await getSettings()
      const totals = calculateTotals(cart, {
        roundToRupee: settings.roundToRupee,
      })

      let amountTenderedPaise = totals.totalPaise
      if (pay.method === 'cash' && pay.amountTenderedPaise !== undefined) {
        amountTenderedPaise = pay.amountTenderedPaise
      }
      if (amountTenderedPaise < totals.totalPaise) {
        throw new AppError(
          'INSUFFICIENT_PAYMENT',
          'Cash received is less than the total',
        )
      }
      const changePaise = amountTenderedPaise - totals.totalPaise

      const counterRow = await db.settings.get('invoiceCounter')
      const sequence = (counterRow?.value ?? 0) + 1
      await db.settings.put({ key: 'invoiceCounter', value: sequence })
      const invoiceNumber = `${settings.invoicePrefix}-${String(sequence).padStart(6, '0')}`

      const sale = {
        id,
        invoiceNumber,
        invoiceSequence: sequence,
        status: 'completed',
        syncStatus: 'pending',
        createdAt: new Date().toISOString(),
        shop: {
          name: settings.shopName,
          address: settings.address,
          phone: settings.phone,
        },
        itemCount: totals.itemCount,
        subtotalPaise: totals.subtotalPaise,
        itemDiscountPaise: totals.itemDiscountPaise,
        billDiscountPaise: totals.billDiscountPaise,
        discountPaise: totals.discountPaise,
        billDiscount: cart.billDiscount ?? null,
        taxableValuePaise: totals.taxableValuePaise,
        taxPaise: totals.taxPaise,
        taxIncludedPaise: totals.taxIncludedPaise,
        taxAddedPaise: totals.taxAddedPaise,
        exactTotalPaise: totals.exactTotalPaise,
        roundOffPaise: totals.roundOffPaise,
        totalPaise: totals.totalPaise,
        payment: {
          method: pay.method,
          amountTenderedPaise,
          changePaise,
          reference: pay.reference ?? '',
        },
      }
      await db.sales.add(sale)

      const items = cart.lines.map((line, index) => {
        const t = totals.lines[index]
        return {
          id: newId(),
          saleId: id,
          lineNumber: index + 1,
          variantId: line.variantId,
          productId: line.productId,
          productName: line.productName,
          sku: line.sku,
          barcode: line.barcode,
          size: line.size,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          mrpPaise: line.mrpPaise,
          taxRatePercent: line.taxRatePercent,
          priceIncludesTax: line.priceIncludesTax,
          discount: line.discount ?? null,
          grossPaise: t.grossPaise,
          lineDiscountPaise: t.lineDiscountPaise,
          billDiscountSharePaise: t.billDiscountSharePaise,
          taxableValuePaise: t.taxableValuePaise,
          taxPaise: t.taxPaise,
          lineTotalPaise: t.lineTotalPaise,
        }
      })
      await db.saleItems.bulkAdd(items)

      // Stock changes and their movement records. If any item is short of
      // stock this throws, and the WHOLE sale above is rolled back.
      for (const line of cart.lines) {
        await adjustStock({
          variantId: line.variantId,
          quantityChange: -line.quantity,
          type: 'sale',
          referenceId: id,
        })
      }

      return { sale, items, duplicate: false }
    },
  )
}

export async function getSale(id) {
  const sale = await db.sales.get(id)
  if (!sale) return null
  const items = await db.saleItems.where('saleId').equals(id).toArray()
  items.sort((a, b) => a.lineNumber - b.lineNumber)
  return { sale, items }
}

// Newest first.
export function listSales({ limit = 50 } = {}) {
  return db.sales.orderBy('createdAt').reverse().limit(limit).toArray()
}
