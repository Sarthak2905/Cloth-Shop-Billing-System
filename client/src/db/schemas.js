import { z } from 'zod'
import { AppError } from '../lib/errors.js'

const text = (max) => z.string().trim().min(1, 'Required').max(max)

export const productInputSchema = z.object({
  name: text(120),
  category: text(60),
  brand: z.string().trim().max(60),
  supplier: z.string().trim().max(120),
})

const variantFields = {
  sku: text(40),
  barcode: z
    .string()
    .trim()
    .min(4, 'Barcode too short')
    .max(48)
    .regex(/^[A-Za-z0-9\-_.]+$/, 'Barcode has invalid characters'),
  size: text(20),
  costPaise: z.number().int().nonnegative(),
  mrpPaise: z.number().int().nonnegative(),
  sellingPricePaise: z.number().int().nonnegative(),
  taxRatePercent: z.number().min(0).max(100),
  priceIncludesTax: z.boolean(),
  reorderThreshold: z.number().int().nonnegative(),
}

const priceRule = [
  (d) => d.sellingPricePaise <= d.mrpPaise,
  { message: 'Selling price cannot exceed MRP', path: ['sellingPricePaise'] },
]

export const variantCreateSchema = z
  .object({
    ...variantFields,
    productId: z.string().min(1),
    openingStock: z.number().int().nonnegative(),
  })
  .refine(...priceRule)

// Used for edits. Stock is NOT editable here; stock only changes via adjustStock.
export const variantEditSchema = z.object(variantFields).refine(...priceRule)

export const settingsSchema = z.object({
  shopName: text(80),
  address: z.string().trim().max(200),
  phone: z.string().trim().max(20),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,6}$/, 'Use 1-6 capital letters or digits'),
  allowNegativeStock: z.boolean(),
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
