import mongoose from "mongoose";
import "./User.js";
import "./AuditLog.js";
import "./Settings.js";
import { Product } from "./Product.js";
import { Variant, dropLegacyVariantIndexes } from "./Variant.js";
import { StockMovement } from "./StockMovement.js";
import "./Counter.js";
import { Sale } from "./Sale.js";

// Builds every unique index up front, so duplicates are refused from the first request.
// First the old unique indexes on SKU and on product + size are removed from an older
// database, so the same product and size can be entered again.
export async function initModels() {
  await dropLegacyVariantIndexes();
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
  // Downloading asks for "everything changed after this point", page by page. These
  // indexes keep that fast when there are many bills.
  await Promise.all([
    Product.collection.createIndex({ updatedAt: 1, _id: 1 }),
    Variant.collection.createIndex({ updatedAt: 1, _id: 1 }),
    Sale.collection.createIndex({ updatedAt: 1, _id: 1 }),
    StockMovement.collection.createIndex({ createdAt: 1, _id: 1 }),
  ]);
}
