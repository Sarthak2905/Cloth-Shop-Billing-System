import { badRequest, conflict, notFound } from "../errors.js";
import { MOVEMENT_TYPES, StockMovement } from "../models/StockMovement.js";
import { Variant } from "../models/Variant.js";

// The ONLY way stock changes. Call it inside runInTransaction and pass the session:
// the stock update and its movement record are then saved together, or not at all.
//
// For a removal, the update itself says "only if enough stock is there". That makes
// it safe when many requests arrive at the same moment: they cannot oversell.
//
// `movementId` and `occurredAt` are used when a device syncs a change it made earlier:
// the movement keeps the device's id (so it can never be applied twice) and its time.
export async function applyStockChange({
  variantId,
  quantityChange,
  type,
  reason = "",
  referenceId = null,
  userId = null,
  allowNegative = false,
  movementId = null,
  occurredAt = null,
  session,
}) {
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw badRequest(
      "Quantity change must be a non-zero whole number",
      "VALIDATION_ERROR",
    );
  }
  if (!MOVEMENT_TYPES.includes(type)) {
    throw badRequest(`Unknown movement type "${type}"`, "VALIDATION_ERROR");
  }

  const filter = { _id: variantId };
  if (quantityChange < 0 && !allowNegative) {
    filter.currentStock = { $gte: -quantityChange };
  }

  const variant = await Variant.findOneAndUpdate(
    filter,
    { $inc: { currentStock: quantityChange } },
    { returnDocument: "after", session },
  );

  if (!variant) {
    const existing = await Variant.findById(variantId).session(session);
    if (!existing) throw notFound("Variant not found");
    throw conflict(
      "INSUFFICIENT_STOCK",
      `Only ${existing.currentStock} in stock for ${existing.sku}`,
      {
        variantId,
        available: existing.currentStock,
        requested: -quantityChange,
      },
    );
  }

  const [movement] = await StockMovement.create(
    [
      {
        ...(movementId ? { _id: movementId } : {}),
        variantId,
        type,
        quantityChange,
        stockAfter: variant.currentStock,
        reason,
        referenceId,
        userId,
        occurredAt: occurredAt ?? new Date(),
      },
    ],
    { session },
  );

  return { variant, movement };
}
