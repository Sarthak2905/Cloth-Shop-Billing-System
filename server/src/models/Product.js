import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    brand: { type: String, default: "", trim: true, maxlength: 60 },
    supplier: { type: String, default: "", trim: true, maxlength: 120 },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);
productSchema.index({ name: 1 });

export const Product =
  mongoose.models.Product ?? mongoose.model("Product", productSchema);

export function publicProduct(product) {
  return {
    id: product._id,
    name: product.name,
    category: product.category,
    brand: product.brand,
    supplier: product.supplier,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
