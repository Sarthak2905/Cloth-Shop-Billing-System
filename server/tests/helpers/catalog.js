import { randomUUID } from "node:crypto";
import { Product } from "../../src/models/Product.js";
import { Variant } from "../../src/models/Variant.js";

// Creates records straight in the database (skipping the API), for test set-up.
export function makeProduct(over = {}) {
  return Product.create({ name: "Cotton Shirt", category: "Shirts", ...over });
}

export function makeVariant(productId, over = {}) {
  const unique = randomUUID().replace(/-/g, "");
  return Variant.create({
    productId,
    sku: `SKU-${unique.slice(0, 8)}`,
    barcode: `BC${unique.slice(0, 10)}`,
    size: "M",
    costPaise: 30000,
    mrpPaise: 99900,
    sellingPricePaise: 79900,
    taxRatePercent: 5,
    priceIncludesTax: true,
    reorderThreshold: 3,
    currentStock: 10,
    ...over,
  });
}

// A valid request body for creating a variant through the API.
export const variantBody = (over = {}) => ({
  sku: "SHIRT-M",
  barcode: "CLO000001",
  size: "M",
  costPaise: 30000,
  mrpPaise: 99900,
  sellingPricePaise: 79900,
  taxRatePercent: 5,
  openingStock: 10,
  ...over,
});
