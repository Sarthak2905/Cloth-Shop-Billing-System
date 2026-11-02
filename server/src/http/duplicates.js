import { conflict } from "../errors.js";

// Turns MongoDB's "duplicate key" error into a clear message. Anything else is
// returned unchanged.
export function translateDuplicate(err, { barcode, size } = {}) {
  if (err?.code !== 11000) return err;
  const fields = Object.keys(err.keyPattern ?? err.keyValue ?? {});

  if (fields.includes("barcode")) {
    return conflict(
      "DUPLICATE_BARCODE",
      `Barcode "${barcode ?? ""}" is already used`,
    );
  }
  if (fields.includes("sku"))
    return conflict("DUPLICATE_SKU", "That SKU is already used");
  if (fields.includes("productId") && fields.includes("size")) {
    return conflict(
      "DUPLICATE_VARIANT",
      `This product already has size ${size ?? ""}`.trim(),
    );
  }
  if (fields.includes("_id"))
    return conflict("ID_EXISTS", "An item with that id already exists");
  return err;
}
