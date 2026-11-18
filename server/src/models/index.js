import mongoose from "mongoose";
import "./User.js";
import "./AuditLog.js";
import "./Settings.js";
import "./Product.js";
import { dropLegacyVariantIndexes } from "./Variant.js";
import "./StockMovement.js";
import "./Counter.js";
import "./Sale.js";

// Builds every unique index up front, so duplicates are refused from the first request.
// First the old unique indexes on SKU and on product + size are removed from an older
// database, so the same product and size can be entered again.
export async function initModels() {
  await dropLegacyVariantIndexes();
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
}
