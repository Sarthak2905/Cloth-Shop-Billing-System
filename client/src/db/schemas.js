import { z } from 'zod'
import { AppError } from '../lib/errors.js'

const text = (max) => z.string().trim().min(1, 'Required').max(max)
const optionalText = (max) => z.string().trim().max(max)

export const productInputSchema = z.object({
  name: text(120),
  // company, category and supplier are optional
  category: optionalText(60).default(''),
  brand: optionalText(60).default(''),
  supplier: optionalText(120).default(''),
  // optional, so products saved before this setting existed can still be edited
  discountAllowed: z.boolean().optional(),
})

const barcodeField = z
  .string()
  .trim()
  .min(4, 'Barcode too short')
  .max(48)
  .regex(/^[A-Za-z0-9\-_.]+$/, 'Barcode has invalid characters')

const variantFields = {
  // Hidden. A new entry keeps it equal to its barcode, so older code and the server
  // keep working. Nobody types it any more.
  sku: optionalText(48).optional(),
  barcode: barcodeField,
  // Any text, even empty: "M", "32", "2-3 years", "Free size"
  size: optionalText(50).default(''),
  unit: z.enum(['piece', 'meter']).default('piece'),
  costPaise: z.number().int().nonnegative(),
  mrpPaise: z.number().int().nonnegative(),
  sellingPricePaise: z.number().int().nonnegative(),
  taxRatePercent: z.number().min(0).max(100),
  priceIncludesTax: z.boolean(),
  reorderThreshold: z.number().int().nonnegative(),
}

export const variantCreateSchema = z.object({
  ...variantFields,
  // empty means "make one automatically"
  barcode: barcodeField.optional(),
  productId: z.string().min(1),
  openingStock: z.number().int().nonnegative(),
})

// Used for edits. Stock is NOT editable here; stock only changes via adjustStock.
export const variantEditSchema = z.object(variantFields)

export const settingsSchema = z.object({
  shopName: text(80),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(20),
  taxId: z.string().trim().max(20),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,6}$/, 'Use 1-6 capital letters or digits'),
  receiptFooter: z.string().trim().max(120),
  receiptPaperWidth: z.enum(['58', '80', '80-42']),
  receiptPrinter: z.enum(['simulated:ok', 'browser']),
  receiptTextSize: z.enum(['normal', 'large', 'extra']),
  receiptLanguage: z.enum(['en', 'mr']),
  autoPrintReceipt: z.boolean(),
  allowNegativeStock: z.boolean(),
  roundToRupee: z.boolean(),
})

// Runs a schema and converts failures into our AppError.
export function validate(schema, data) {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Some fields are invalid',
      result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    )
  }
  return result.data
}
