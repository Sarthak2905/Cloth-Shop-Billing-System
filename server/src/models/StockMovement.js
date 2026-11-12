import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

export const MOVEMENT_TYPES = [
  "opening",
  "sale",
  "purchase",
  "return",
  "adjustment",
];

// An append-only record of every change to a variant's stock.
const movementSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    variantId: { type: String, required: true, index: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantityChange: {
      type: Number,
      required: true,
      validate: Number.isInteger,
    },
    stockAfter: { type: Number, required: true, validate: Number.isInteger },
    reason: { type: String, default: "", trim: true, maxlength: 200 },
    referenceId: { type: String, default: null, index: true },
    userId: { type: String, default: null },
    // When it really happened. For a change synced from a device this is the device's
    // time. createdAt is always the time the server recorded it.
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index({ variantId: 1, createdAt: -1 });

export const StockMovement =
  mongoose.models.StockMovement ??
  mongoose.model("StockMovement", movementSchema);

export function publicMovement(movement) {
  return {
    id: movement._id,
    variantId: movement.variantId,
    type: movement.type,
    quantityChange: movement.quantityChange,
    stockAfter: movement.stockAfter,
    reason: movement.reason,
    referenceId: movement.referenceId,
    userId: movement.userId,
    occurredAt: movement.occurredAt,
    createdAt: movement.createdAt,
  };
}
