import { z } from "zod";
import { paymentLineSchema } from "./saleSchemas.js";

const text = (max) => z.string().trim().min(1).max(max);
const paise = z.number().int().min(0).max(100_000_000);
const isDate = (value) => !Number.isNaN(Date.parse(value));

// The outer shape of a batch. Each operation's `data` is checked separately, so one
// bad operation is reported for itself and does not fail the whole batch.
export const pushEnvelopeSchema = z
  .object({
    ops: z
      .array(
        z
          .object({
            type: z.string().min(1).max(40),
            data: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export const productDataSchema = z
  .object({
    id: z.string().uuid(),
    name: text(120),
    category: z.string().trim().max(60), // may be empty
    brand: z.string().trim().max(60),
    supplier: z.string().trim().max(120),
    status: z.enum(["active", "archived"]),
    discountAllowed: z.boolean().optional(),
  })
  .strict();

// One stock entry. Any size text (even empty), any SKU, the same product and size as many
// times as needed. Only the barcode must be unique. Selling above MRP is allowed.
export const variantDataSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    sku: z.string().trim().max(48), // may be empty
    barcode: z
      .string()
      .trim()
      .min(4)
      .max(48)
      .regex(/^[A-Za-z0-9\-_.]+$/, "Barcode has invalid characters"),
    size: z.string().trim().max(50), // may be empty
    unit: z.enum(["piece", "meter"]).optional(),
    packSize: z.number().int().min(1).max(100_000).optional(),
    costPaise: paise,
    mrpPaise: paise,
    sellingPricePaise: paise,
    taxRatePercent: z.number().min(0).max(100),
    priceIncludesTax: z.boolean(),
    reorderThreshold: z.number().int().min(0).max(10_000_000),
    status: z.enum(["active", "archived"]),
  })
  .strict();

// Sale movements are NOT sent: the server creates them when it saves the sale.
// For fabric, quantityChange is in whole centimetres.
export const movementDataSchema = z
  .object({
    id: z.string().uuid(),
    variantId: z.string().min(1).max(64),
    type: z.enum(["opening", "adjustment", "purchase", "return"]),
    quantityChange: z
      .number()
      .int()
      .min(-10_000_000)
      .max(10_000_000)
      .refine((n) => n !== 0, { message: "Quantity change must not be zero" }),
    reason: z.string().trim().max(200),
    createdAt: z.string().refine(isDate, "Not a valid date and time"),
  })
  .strict();

// The payment of a bill that was saved earlier (recorded or changed later).
// `rev` goes up with every change on the device, so an older one arriving late is ignored.
export const salePaymentDataSchema = z
  .object({
    saleId: z.string().uuid(),
    payments: z.array(paymentLineSchema).max(6),
    recordedAt: z
      .string()
      .refine(isDate, "Not a valid date and time")
      .optional(),
    rev: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

// A bill that was cancelled (usually because a corrected bill replaced it).
export const saleCancelDataSchema = z
  .object({
    saleId: z.string().uuid(),
    cancelledAt: z.string().refine(isDate, "Not a valid date and time"),
    reason: text(80),
    replacedBySaleId: z.string().uuid().optional(),
    replacedByInvoice: z.string().max(20).optional(),
  })
  .strict();
