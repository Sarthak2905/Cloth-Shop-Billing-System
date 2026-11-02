import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

const wholeNumber = {
  validator: Number.isInteger,
  message: "{PATH} must be a whole number",
};
const paise = { type: Number, required: true, min: 0, validate: wholeNumber };

// One sellable item: a product in one size. Money is whole paise.
const variantSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    productId: { type: String, required: true, index: true },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 40,
    },
    barcode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 48,
    },
    size: { type: String, required: true, trim: true, maxlength: 20 },
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
variantSchema.index({ productId: 1, size: 1 }, { unique: true });

export const Variant =
  mongoose.models.Variant ?? mongoose.model("Variant", variantSchema);

// Cost price is what the shop paid. Only admins may see it.
export function publicVariant(variant, { includeCost = false } = {}) {
  const out = {
    id: variant._id,
    productId: variant.productId,
    sku: variant.sku,
    barcode: variant.barcode,
    size: variant.size,
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
