import { runInTransaction } from "../db/transaction.js";
import {
  movementDataSchema,
  productDataSchema,
  variantDataSchema,
} from "../domain/syncSchemas.js";
import { saleCreateSchema } from "../domain/saleSchemas.js";
import { AppError } from "../errors.js";
import { translateDuplicate } from "../http/duplicates.js";
import { parse } from "../http/validate.js";
import { Product } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { Variant } from "../models/Variant.js";
import { audit } from "./audit.js";
import { createSale } from "./sales.js";
import { applyStockChange } from "./stock.js";

const PRODUCT_FIELDS = ["name", "category", "brand", "supplier", "status"];
const VARIANT_FIELDS = [
  "sku",
  "barcode",
  "size",
  "costPaise",
  "mrpPaise",
  "sellingPricePaise",
  "taxRatePercent",
  "priceIncludesTax",
  "reorderThreshold",
  "status",
];

function requireAdmin(user) {
  if (user.role !== "admin") {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only an admin can sync catalogue and stock changes",
    );
  }
}

const isDuplicateId = (err) =>
  err?.code === 11000 &&
  Object.keys(err.keyPattern ?? err.keyValue ?? {}).includes("_id");

// Copies the listed fields onto a document and returns what actually changed.
function applyFields(doc, data, fields) {
  const changes = {};
  for (const field of fields) {
    if (doc[field] !== data[field]) {
      changes[field] = { from: doc[field], to: data[field] };
      doc[field] = data[field];
    }
  }
  return changes;
}

async function upsertProduct(data, req) {
  requireAdmin(req.user);

  // Tried twice: if two requests create the same product at once, the second
  // one finds it on its second try and simply updates it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await Product.findById(data.id);

    if (!existing) {
      try {
        await Product.create({
          _id: data.id,
          ...Object.fromEntries(PRODUCT_FIELDS.map((f) => [f, data[f]])),
        });
        return { status: "applied", created: true, changed: true };
      } catch (err) {
        if (isDuplicateId(err)) continue;
        throw err;
      }
    }

    const changes = applyFields(existing, data, PRODUCT_FIELDS);
    if (Object.keys(changes).length === 0)
      return { status: "applied", created: false, changed: false };

    await existing.save();
    await audit(req, {
      action: "sync.product.updated",
      entity: "product",
      entityId: existing._id,
      details: { changes },
    });
    return { status: "applied", created: false, changed: true };
  }
  throw new AppError(
    409,
    "ID_EXISTS",
    "Could not save this product, please retry",
  );
}

async function upsertVariant(data, req) {
  requireAdmin(req.user);

  if (!(await Product.exists({ _id: data.productId }))) {
    throw new AppError(
      422,
      "PRODUCT_MISSING",
      "The product for this item is not on the server",
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await Variant.findById(data.id);

    if (!existing) {
      try {
        await Variant.create({
          _id: data.id,
          productId: data.productId,
          currentStock: 0, // stock only ever arrives as movements
          ...Object.fromEntries(VARIANT_FIELDS.map((f) => [f, data[f]])),
        });
        return { status: "applied", created: true, changed: true };
      } catch (err) {
        if (isDuplicateId(err)) continue;
        throw translateDuplicate(err, data);
      }
    }

    if (existing.productId !== data.productId) {
      throw new AppError(
        409,
        "IMMUTABLE_FIELD",
        "An item cannot be moved to a different product",
      );
    }

    const changes = applyFields(existing, data, VARIANT_FIELDS);
    if (Object.keys(changes).length === 0)
      return { status: "applied", created: false, changed: false };

    try {
      await existing.save();
    } catch (err) {
      throw translateDuplicate(err, data);
    }
    await audit(req, {
      action: "sync.variant.updated",
      entity: "variant",
      entityId: existing._id,
      details: { sku: existing.sku, changes },
    });
    return { status: "applied", created: false, changed: true };
  }
  throw new AppError(
    409,
    "ID_EXISTS",
    "Could not save this item, please retry",
  );
}

async function applyMovement(data, req) {
  requireAdmin(req.user);

  if (await StockMovement.exists({ _id: data.id }))
    return { status: "duplicate" };

  try {
    const { variant } = await runInTransaction((session) =>
      applyStockChange({
        variantId: data.variantId,
        quantityChange: data.quantityChange,
        type: data.type,
        reason: data.reason,
        userId: req.user._id,
        // It already happened on the device, so it is recorded even if stock goes below zero.
        allowNegative: true,
        movementId: data.id,
        occurredAt: new Date(data.createdAt),
        session,
      }),
    );
    return { status: "applied", stockAfter: variant.currentStock };
  } catch (err) {
    if (isDuplicateId(err)) return { status: "duplicate" };
    throw err;
  }
}

async function applySale(data, req) {
  const parsed = parse(saleCreateSchema, data);
  // Whatever the device says, a synced sale already happened. It is saved and flagged,
  // never refused for stock or price rules.
  const { sale, duplicate } = await createSale({
    data: { ...parsed, offline: true },
    user: req.user,
  });

  if (!duplicate) {
    await audit(req, {
      action: "sale.created",
      entity: "sale",
      entityId: sale._id,
      details: {
        invoiceNumber: sale.invoiceNumber,
        totalPaise: sale.totalPaise,
        source: sale.source,
        flags: sale.flags.map((flag) => flag.code),
      },
    });
  }
  return {
    status: duplicate ? "duplicate" : "applied",
    invoiceNumber: sale.invoiceNumber,
    flags: sale.flags.map((flag) => flag.code),
  };
}

// Applies one operation. Throws an AppError for anything the server refuses.
export async function applyOperation(op, req) {
  switch (op.type) {
    case "product.upsert":
      return upsertProduct(parse(productDataSchema, op.data), req);
    case "variant.upsert":
      return upsertVariant(parse(variantDataSchema, op.data), req);
    case "stock.movement":
      return applyMovement(parse(movementDataSchema, op.data), req);
    case "sale.create":
      return applySale(op.data, req);
    default:
      throw new AppError(
        422,
        "UNSUPPORTED_TYPE",
        `Unknown operation type "${op.type}"`,
      );
  }
}
