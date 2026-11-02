import { z } from "zod";

// These mirror the rules in the app. There are no .default() values here on purpose:
// defaults would overwrite existing data when a field is simply left out of an update.

const text = (max) => z.string().trim().min(1).max(max);
const paise = z.number().int().min(0).max(100_000_000);

const productFields = {
  name: text(120),
  category: text(60),
  brand: z.string().trim().max(60),
  supplier: z.string().trim().max(120),
};

export const productCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    ...productFields,
    brand: productFields.brand.optional(),
    supplier: productFields.supplier.optional(),
  })
  .strict();

export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

const variantFields = {
  sku: text(40),
  barcode: z
    .string()
    .trim()
    .min(4, "Barcode too short")
    .max(48)
    .regex(/^[A-Za-z0-9\-_.]+$/, "Barcode has invalid characters"),
  size: text(20),
  costPaise: paise,
  mrpPaise: paise,
  sellingPricePaise: paise,
  taxRatePercent: z.number().min(0).max(100),
  priceIncludesTax: z.boolean(),
  reorderThreshold: z.number().int().min(0).max(1_000_000),
};

const sellingNotAboveMrp = {
  check: (v) =>
    v.sellingPricePaise === undefined ||
    v.mrpPaise === undefined ||
    v.sellingPricePaise <= v.mrpPaise,
  options: {
    message: "Selling price cannot exceed MRP",
    path: ["sellingPricePaise"],
  },
};

export const variantCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    sku: variantFields.sku,
    barcode: variantFields.barcode,
    size: variantFields.size,
    costPaise: variantFields.costPaise,
    mrpPaise: variantFields.mrpPaise,
    sellingPricePaise: variantFields.sellingPricePaise,
    taxRatePercent: variantFields.taxRatePercent.optional(),
    priceIncludesTax: variantFields.priceIncludesTax.optional(),
    reorderThreshold: variantFields.reorderThreshold.optional(),
    openingStock: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()
  .refine(sellingNotAboveMrp.check, sellingNotAboveMrp.options);

// Stock is NOT here: it can only change through stock adjustments.
export const variantUpdateSchema = z
  .object(variantFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  })
  .refine(sellingNotAboveMrp.check, sellingNotAboveMrp.options);

export const stockAdjustmentSchema = z
  .object({
    quantityChange: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, { message: "Quantity change must not be zero" }),
    reason: z.string().trim().min(3, "Please give a reason").max(200),
  })
  .strict();

export const barcodeParamSchema = variantFields.barcode;
