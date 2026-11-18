import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

const wholeNumber = {
  validator: Number.isInteger,
  message: "{PATH} must be a whole number",
};
const paise = { type: Number, required: true, min: 0, validate: wholeNumber };

// One stock entry: a product in one size, with its own barcode, stock, cost and price.
// The same product and size can be entered any number of times. Only the barcode is
// unique. Money is whole paise. For fabric sold by the meter, stock and quantities are
// whole CENTIMETRES and prices are per meter.
const variantSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    productId: { type: String, required: true, index: true },
    sku: { type: String, default: "", trim: true, maxlength: 48 },
    barcode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 48,
    },
    size: { type: String, default: "", trim: true, maxlength: 50 },
    unit: { type: String, enum: ["piece", "meter"], default: "piece" },
    // pieces in one box or packet, when the stock came in boxes (optional)
    packSize: { type: Number, min: 1, validate: wholeNumber },
    costPaise: paise,
    mrpPaise: paise,
    sellingPricePaise: paise,
    taxRatePercent: { type: Number, default: 0, min: 0, max: 100 },
    priceIncludesTax: { type: Boolean, default: true },
    reorderThreshold: {
      type: Number,
      default: 0,
      min: 0,
      validate: wholeNumber,
    },
    // Changed only by services/stock.js. It can go negative only when the shop allows it.
    currentStock: { type: Number, default: 0, validate: wholeNumber },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

export const Variant =
  mongoose.models.Variant ?? mongoose.model("Variant", variantSchema);

// An older database has unique indexes on the SKU and on product + size. They would
// refuse the same product and size entered twice, so they are removed (once; after that
// this does nothing).
export async function dropLegacyVariantIndexes() {
  let indexes = [];
  try {
    indexes = await Variant.collection.indexes();
  } catch {
    return; // the collection does not exist yet: nothing to remove
  }
  for (const name of ["sku_1", "productId_1_size_1"]) {
    if (indexes.some((index) => index.name === name)) {
      await Variant.collection.dropIndex(name);
    }
  }
}

// Cost price is what the shop paid. Only admins may see it.
export function publicVariant(variant, { includeCost = false } = {}) {
  const out = {
    id: variant._id,
    productId: variant.productId,
    sku: variant.sku,
    barcode: variant.barcode,
    size: variant.size,
    unit: variant.unit ?? "piece",
    packSize: variant.packSize ?? null,
    mrpPaise: variant.mrpPaise,
    sellingPricePaise: variant.sellingPricePaise,
    taxRatePercent: variant.taxRatePercent,
    priceIncludesTax: variant.priceIncludesTax,
    reorderThreshold: variant.reorderThreshold,
    currentStock: variant.currentStock,
    status: variant.status,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
  if (includeCost) out.costPaise = variant.costPaise;
  return out;
}
