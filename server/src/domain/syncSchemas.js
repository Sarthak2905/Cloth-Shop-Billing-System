import { z } from "zod";

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
    category: text(60),
    brand: z.string().trim().max(60),
    supplier: z.string().trim().max(120),
    status: z.enum(["active", "archived"]),
  })
  .strict();

export const variantDataSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    sku: text(40),
    barcode: z
      .string()
      .trim()
      .min(4)
      .max(48)
      .regex(/^[A-Za-z0-9\-_.]+$/, "Barcode has invalid characters"),
    size: text(20),
    costPaise: paise,
    mrpPaise: paise,
    sellingPricePaise: paise,
    taxRatePercent: z.number().min(0).max(100),
    priceIncludesTax: z.boolean(),
    reorderThreshold: z.number().int().min(0).max(1_000_000),
    status: z.enum(["active", "archived"]),
  })
  .strict()
  .refine((v) => v.sellingPricePaise <= v.mrpPaise, {
    message: "Selling price cannot exceed MRP",
    path: ["sellingPricePaise"],
  });

// Sale movements are NOT sent: the server creates them when it saves the sale.
export const movementDataSchema = z
  .object({
    id: z.string().uuid(),
    variantId: z.string().min(1).max(64),
    type: z.enum(["opening", "adjustment", "purchase", "return"]),
    quantityChange: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, { message: "Quantity change must not be zero" }),
    reason: z.string().trim().max(200),
    createdAt: z.string().refine(isDate, "Not a valid date and time"),
  })
  .strict();
