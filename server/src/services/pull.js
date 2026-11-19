import { badRequest } from "../errors.js";
import { Product, publicProduct } from "../models/Product.js";
import { Sale, publicSale } from "../models/Sale.js";
import { StockMovement, publicMovement } from "../models/StockMovement.js";
import { Variant, publicVariant } from "../models/Variant.js";

// What a device can download, and how. Rows come oldest change first, so a device can
// keep asking for "everything after the last row I have".
// `field` is the time that marks a change: updatedAt for rows that can change, createdAt
// for stock movements (they are never changed). The owner (admin) sees cost prices.
export const PULL_KINDS = {
  products: {
    model: Product,
    field: "updatedAt",
    defaultLimit: 200,
    maxLimit: 500,
    view: (doc) => publicProduct(doc),
  },
  variants: {
    model: Variant,
    field: "updatedAt",
    defaultLimit: 200,
    maxLimit: 500,
    view: (doc) => publicVariant(doc, { includeCost: true }),
  },
  sales: {
    model: Sale,
    field: "updatedAt",
    defaultLimit: 50,
    maxLimit: 100, // a bill carries its items, so pages are smaller
    view: (doc) => ({
      ...publicSale(doc, { includeCost: true }),
      updatedAt: doc.updatedAt,
      paymentRev: doc.paymentRev ?? 0,
    }),
  },
  movements: {
    model: StockMovement,
    field: "createdAt",
    defaultLimit: 300,
    maxLimit: 500,
    view: (doc) => publicMovement(doc),
  },
};

export function pageSize(kind, requested) {
  const spec = PULL_KINDS[kind];
  if (!Number.isInteger(requested) || requested < 1) return spec.defaultLimit;
  return Math.min(requested, spec.maxLimit);
}

// A cursor is "<time>|<id>": the change time of the last row a device has, and its id.
// The id breaks ties between rows changed in the same millisecond.
export function makeCursor(time, id) {
  return `${new Date(time).toISOString()}|${id}`;
}

export function parseCursor(text) {
  if (text === undefined || text === null || text === "") return null;
  const at = String(text).indexOf("|");
  const time = new Date(String(text).slice(0, Math.max(at, 0)));
  const id = at > 0 ? String(text).slice(at + 1) : "";
  if (at < 1 || !id || Number.isNaN(time.getTime())) {
    throw badRequest("The cursor is not valid", "VALIDATION_ERROR");
  }
  return { time, id };
}

// One page: { items, cursor, hasMore }. `cursor` is where the next call continues. With
// no rows it stays where it was, so a device can ask again later for newer changes.
export async function pullPage(kind, { after, limit } = {}) {
  const spec = PULL_KINDS[kind];
  const cursor = parseCursor(after);
  const size = pageSize(kind, limit);

  const filter = cursor
    ? {
        $or: [
          { [spec.field]: { $gt: cursor.time } },
          { [spec.field]: cursor.time, _id: { $gt: cursor.id } },
        ],
      }
    : {};

  const docs = await spec.model
    .find(filter)
    .sort({ [spec.field]: 1, _id: 1 })
    .limit(size + 1);

  const hasMore = docs.length > size;
  const page = hasMore ? docs.slice(0, size) : docs;
  const last = page.at(-1);
  return {
    items: page.map(spec.view),
    cursor: last ? makeCursor(last[spec.field], last._id) : (after ?? null),
    hasMore,
  };
}
