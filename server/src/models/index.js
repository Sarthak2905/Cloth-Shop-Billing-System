import mongoose from "mongoose";
import "./User.js";
import "./AuditLog.js";
import "./Settings.js";
import "./Product.js";
import "./Variant.js";
import "./StockMovement.js";

// Builds every unique index up front, so duplicates are refused from the first request.
export async function initModels() {
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
}
