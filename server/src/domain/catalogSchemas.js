import { z } from "zod";

// These mirror the rules in the app. There are no .default() values here on purpose:
// defaults would overwrite existing data when a field is simply left out of an update.

const text = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max);
const paise = z.number().int().min(0).max(100_000_000);

const productFields = {
  name: text(120),
  category: optionalText(60),
  brand: optionalText(60),
  supplier: optionalText(120),
  discountAllowed: z.boolean(),
};

export const productCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: productFields.name,
    category: productFields.category.optional(),
    brand: productFields.brand.optional(),
    supplier: productFields.supplier.optional(),
    discountAllowed: productFields.discountAllowed.optional(),
  })
  .strict();

export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

// A stock entry. The SKU and the size may be empty, the same product and size may be
// entered any number of times, and the selling price may be above the MRP.
const variantFields = {
  sku: optionalText(48),
  barcode: z
    .string()
    .trim()
    .min(4, "Barcode too short")
    .max(48)
    .regex(/^[A-Za-z0-9\-_.]+$/, "Barcode has invalid characters"),
  size: optionalText(50),
  costPaise: paise,
  mrpPaise: paise,
  sellingPricePaise: paise,
  taxRatePercent: z.number().min(0).max(100),
  priceIncludesTax: z.boolean(),
  reorderThreshold: z.number().int().min(0).max(10_000_000),
  packSize: z.number().int().min(1).max(100_000),
};

export const variantCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    sku: variantFields.sku.optional(),
    barcode: variantFields.barcode,
    size: variantFields.size.optional(),
    // pieces, or fabric sold by the meter (stock is then in whole centimetres)
    unit: z.enum(["piece", "meter"]).optional(),
    packSize: variantFields.packSize.optional(),
    costPaise: variantFields.costPaise.optional(),
    mrpPaise: variantFields.mrpPaise.optional(),
    sellingPricePaise: variantFields.sellingPricePaise,
    taxRatePercent: variantFields.taxRatePercent.optional(),
    priceIncludesTax: variantFields.priceIncludesTax.optional(),
    reorderThreshold: variantFields.reorderThreshold.optional(),
    openingStock: z.number().int().min(0).max(10_000_000).optional(),
  })
  .strict();

// Stock is NOT here: it can only change through stock adjustments. Neither is the unit.
export const variantUpdateSchema = z
  .object(variantFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export const stockAdjustmentSchema = z
  .object({
    quantityChange: z
      .number()
      .int()
      .min(-10_000_000)
      .max(10_000_000)
      .refine((n) => n !== 0, { message: "Quantity change must not be zero" }),
    reason: z.string().trim().min(3, "Please give a reason").max(200),
  })
  .strict();

export const barcodeParamSchema = variantFields.barcode;
