import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { Product } from "../src/models/Product.js";
import { Sale } from "../src/models/Sale.js";
import { Variant, dropLegacyVariantIndexes } from "../src/models/Variant.js";
import {
  authHeader,
  clearDatabase,
  createUser,
  startTestDatabase,
  stopTestDatabase,
  testConfig,
} from "./helpers/testApp.js";

let app;

beforeAll(async () => {
  await startTestDatabase();
  app = createApp(testConfig());
});

afterAll(stopTestDatabase);
beforeEach(clearDatabase);

const push = (token, ops) =>
  request(app).post("/api/sync/push").set(authHeader(token)).send({ ops });
const statuses = (res) => res.body.results.map((r) => r.status);
const stockOf = async (id) => (await Variant.findById(id)).currentStock;
const saleOf = async (id) => (await Sale.findById(id)).toObject();

let counter = 0;
const next = () => String(++counter).padStart(6, "0");
const now = () => new Date().toISOString();

// ---- operations, shaped like the ones the app sends ----
const productOp = (over = {}) => ({
  type: "product.upsert",
  data: {
    id: randomUUID(),
    name: "Cotton Shirt",
    category: "Shirts",
    brand: "",
    supplier: "",
    status: "active",
    ...over,
  },
});

const variantOp = (productId, over = {}) => ({
  type: "variant.upsert",
  data: {
    id: randomUUID(),
    productId,
    sku: "",
    barcode: `CLO${next()}`,
    size: "M",
    unit: "piece",
    costPaise: 30000,
    mrpPaise: 79900,
    sellingPricePaise: 79900,
    taxRatePercent: 5,
    priceIncludesTax: true,
    reorderThreshold: 3,
    status: "active",
    ...over,
  },
});

const stockOp = (variantId, quantityChange, over = {}) => ({
  type: "stock.movement",
  data: {
    id: randomUUID(),
    variantId,
    type: "opening",
    quantityChange,
    reason: "Opening stock",
    createdAt: now(),
    ...over,
  },
});

const saleOp = (lines, over = {}) => ({
  type: "sale.create",
  data: {
    id: randomUUID(),
    invoiceNumber: `INV-${next()}`,
    soldAt: now(),
    offline: true,
    lines,
    ...over,
  },
});

const line = (variant, quantity = 1, over = {}) => ({
  variantId: variant.id,
  quantity,
  unitPricePaise: variant.sellingPricePaise,
  ...over,
});

const payOp = (sale, payments, rev, over = {}) => ({
  type: "sale.payment",
  data: { saleId: sale.data.id, payments, rev, ...over },
});

const cancelOp = (sale, over = {}) => ({
  type: "sale.cancel",
  data: {
    saleId: sale.data.id,
    cancelledAt: now(),
    reason: "Wrong price",
    ...over,
  },
});

// A product, one item and its opening stock, pushed and checked.
async function catalog(token, { product = {}, variant = {}, stock = 10 } = {}) {
  const p = productOp(product);
  const v = variantOp(p.data.id, variant);
  const ops = [p, v];
  if (stock > 0) ops.push(stockOp(v.data.id, stock));
  const res = await push(token, ops);
  expect(statuses(res)).toEqual(ops.map(() => "applied"));
  return { product: p.data, variant: v.data };
}

// ---------------------------------------------------------------- catalogue

test("the same product and size, the same SKU and an empty size are all accepted", async () => {
  const admin = await createUser();
  const p = productOp({ category: "" });
  const ops = [
    p,
    variantOp(p.data.id, { size: "" }),
    variantOp(p.data.id, { size: "M", sku: "SAME" }),
    variantOp(p.data.id, { size: "M", sku: "SAME" }),
    variantOp(p.data.id, { size: "2-3 years" }),
  ];

  const res = await push(admin.token, ops);

  expect(statuses(res)).toEqual(Array(5).fill("applied"));
  expect(await Variant.countDocuments()).toBe(4);
  expect((await Product.findById(p.data.id)).category).toBe("");
});

test("fabric and box sizes are saved, and the unit cannot be changed afterwards", async () => {
  const admin = await createUser();
  const { variant: fabric } = await catalog(admin.token, {
    variant: {
      unit: "meter",
      sellingPricePaise: 45000,
      mrpPaise: 45000,
      reorderThreshold: 300,
    },
    stock: 2550,
  });
  const { variant: boxed } = await catalog(admin.token, {
    variant: { packSize: 10 },
    stock: 40,
  });

  expect((await Variant.findById(fabric.id)).toObject()).toMatchObject({
    unit: "meter",
    currentStock: 2550,
  });
  expect((await Variant.findById(boxed.id)).toObject()).toMatchObject({
    unit: "piece",
    packSize: 10,
    currentStock: 40,
  });

  const res = await push(admin.token, [
    { type: "variant.upsert", data: { ...fabric, unit: "piece" } },
  ]);
  expect(res.body.results[0]).toMatchObject({
    status: "rejected",
    code: "IMMUTABLE_FIELD",
  });
  expect((await Variant.findById(fabric.id)).unit).toBe("meter");
});

test("an item from an older device, without a unit, is a piece", async () => {
  const admin = await createUser();
  const p = productOp();
  const v = variantOp(p.data.id);
  delete v.data.unit;

  const res = await push(admin.token, [p, v]);

  expect(statuses(res)).toEqual(["applied", "applied"]);
  expect((await Variant.findById(v.data.id)).unit).toBe("piece");
});

test("an item can be sold above its MRP", async () => {
  const admin = await createUser();

  const { variant } = await catalog(admin.token, {
    variant: { sellingPricePaise: 120000, mrpPaise: 99900 },
  });

  expect((await Variant.findById(variant.id)).sellingPricePaise).toBe(120000);
});

test("a product can be set to never take a discount, and a product without the setting allows it", async () => {
  const admin = await createUser();
  const never = productOp({ discountAllowed: false });
  const normal = productOp();

  expect(statuses(await push(admin.token, [never, normal]))).toEqual([
    "applied",
    "applied",
  ]);
  expect((await Product.findById(never.data.id)).discountAllowed).toBe(false);
  expect((await Product.findById(normal.data.id)).discountAllowed).toBe(true);

  const again = productOp({ id: never.data.id, discountAllowed: true });
  expect(statuses(await push(admin.token, [again]))).toEqual(["applied"]);
  expect((await Product.findById(never.data.id)).discountAllowed).toBe(true);
});

// -------------------------------------------------------------------- sales

test("a bill with no payment is saved as payment pending, and its stock is taken", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)]);

  const res = await push(admin.token, [sale]);

  expect(statuses(res)).toEqual(["applied"]);
  const saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({
    paymentStatus: "pending",
    receivedPaise: 0,
    shortPaise: 159800,
    totalPaise: 159800,
    flagged: false,
  });
  expect(saved.payment.method).toBe("pending");
  expect(saved.payments).toHaveLength(0);
  expect(await stockOf(variant.id)).toBe(8);
});

test("half cash and half UPI is saved as a split payment", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)], {
    payments: [
      { method: "cash", amountPaise: 50000 },
      { method: "upi", amountPaise: 109800, reference: "T9" },
    ],
  });

  await push(admin.token, [sale]);

  const saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({
    paymentStatus: "paid",
    receivedPaise: 159800,
    shortPaise: 0,
  });
  expect(saved.payment).toMatchObject({
    method: "split",
    amountTenderedPaise: 159800,
    reference: "T9",
  });
  expect(saved.payments).toHaveLength(2);
});

test("a bargain: less than the bill is accepted, the short amount is kept, and nothing is flagged", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)], {
    payments: [{ method: "cash", amountPaise: 150000 }],
  });

  await push(admin.token, [sale]);

  const saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({
    paymentStatus: "paid",
    receivedPaise: 150000,
    shortPaise: 9800,
    totalPaise: 159800,
    flagged: false,
  });
});

test("UPI above the bill is refused, and nothing is saved", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)], {
    payments: [{ method: "upi", amountPaise: 200000 }],
  });

  const res = await push(admin.token, [sale]);

  expect(res.body.results[0]).toMatchObject({
    status: "rejected",
    code: "VALIDATION_ERROR",
  });
  expect(await Sale.countDocuments()).toBe(0);
  expect(await stockOf(variant.id)).toBe(10);
});

test("the older single payment still works, including the change", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)], {
    payment: { method: "cash", amountTenderedPaise: 160000 },
  });

  await push(admin.token, [sale]);

  const saved = await saleOf(sale.data.id);
  expect(saved.paymentStatus).toBe("paid");
  expect(saved.payment).toMatchObject({
    method: "cash",
    amountTenderedPaise: 160000,
    changePaise: 200,
  });
  expect(saved.payments).toHaveLength(1);
});

test("a product that never takes a discount is left out of the bill discount", async () => {
  const admin = await createUser();
  const shirt = await catalog(admin.token, {
    variant: { sellingPricePaise: 28000, mrpPaise: 28000 },
  });
  const lining = await catalog(admin.token, {
    product: { name: "Lining", discountAllowed: false },
    variant: { sellingPricePaise: 3500, mrpPaise: 3500 },
  });
  const sale = saleOp([line(shirt.variant), line(lining.variant)], {
    billDiscount: { type: "percent", value: 10 },
    claimedTotalPaise: 28700,
  });

  await push(admin.token, [sale]);

  const saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({
    billDiscountPaise: 2800,
    totalPaise: 28700,
    flagged: false,
  });
  const liningItem = saved.items.find((i) => i.variantId === lining.variant.id);
  expect(liningItem).toMatchObject({
    billDiscountSharePaise: 0,
    discountAllowed: false,
    discountExcluded: true,
  });
});

test("an item the cashier switched discounts off for is left out of the bill discount", async () => {
  const admin = await createUser();
  const a = await catalog(admin.token, {
    variant: { sellingPricePaise: 10000, mrpPaise: 10000 },
  });
  const b = await catalog(admin.token, {
    variant: { sellingPricePaise: 10000, mrpPaise: 10000 },
  });
  const sale = saleOp(
    [line(a.variant), line(b.variant, 1, { noDiscount: true })],
    {
      billDiscount: { type: "percent", value: 10 },
      claimedTotalPaise: 19000,
    },
  );

  await push(admin.token, [sale]);

  const saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({
    billDiscountPaise: 1000,
    totalPaise: 19000,
    flagged: false,
  });
  expect(saved.items.find((i) => i.variantId === b.variant.id)).toMatchObject({
    billDiscountSharePaise: 0,
    discountExcluded: true,
  });
});

test("an item discount on a product that never takes one is saved but flagged", async () => {
  const admin = await createUser();
  const lining = await catalog(admin.token, {
    product: { name: "Lining", discountAllowed: false },
    variant: { sellingPricePaise: 3500, mrpPaise: 3500 },
  });
  const sale = saleOp([
    line(lining.variant, 1, { discount: { type: "percent", value: 10 } }),
  ]);

  const res = await push(admin.token, [sale]);

  expect(statuses(res)).toEqual(["applied"]);
  const saved = await saleOf(sale.data.id);
  expect(saved.flagged).toBe(true);
  expect(saved.flags.map((f) => f.code)).toContain("DISCOUNT_NOT_ALLOWED");
});

test("the cost of each item is kept on the bill: the device's own, or else the catalogue cost", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token, {
    variant: { costPaise: 30000 },
  });
  const plain = saleOp([line(variant)]);
  const withCost = saleOp([line(variant, 1, { costPaise: 28000 })]);

  await push(admin.token, [plain, withCost]);

  expect((await saleOf(plain.data.id)).items[0].costPaise).toBe(30000);
  expect((await saleOf(withCost.data.id)).items[0].costPaise).toBe(28000);
});

test("fabric is sold by the meter: 2.35 m at 450 a meter, with stock taken in centimetres", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token, {
    variant: { unit: "meter", sellingPricePaise: 45000, mrpPaise: 45000 },
    stock: 2550,
  });
  const sale = saleOp([line(variant, 235)], { claimedTotalPaise: 105800 });

  await push(admin.token, [sale]);

  const saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({
    itemCount: 1,
    subtotalPaise: 105750,
    totalPaise: 105800,
    flagged: false,
  });
  expect(saved.items[0]).toMatchObject({
    unit: "meter",
    quantity: 235,
    grossPaise: 105750,
  });
  expect(await stockOf(variant.id)).toBe(2315);
});

// ----------------------------------------------------- payment recorded later

test("a payment recorded later changes only the payment, never the bill or the stock", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)]);
  await push(admin.token, [sale]);

  const paid = await push(admin.token, [
    payOp(sale, [{ method: "cash", amountPaise: 100000 }], 1),
  ]);
  expect(statuses(paid)).toEqual(["applied"]);
  let saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({
    paymentStatus: "paid",
    receivedPaise: 100000,
    shortPaise: 59800,
    totalPaise: 159800,
  });
  expect(saved.paymentRecordedAt).not.toBeNull();
  expect(saved.items).toHaveLength(1);
  expect(await stockOf(variant.id)).toBe(8);

  // an older version of the payment arriving late is ignored
  const late = await push(admin.token, [
    payOp(sale, [{ method: "upi", amountPaise: 159800 }], 0),
  ]);
  expect(statuses(late)).toEqual(["duplicate"]);
  expect((await saleOf(sale.data.id)).receivedPaise).toBe(100000);

  // clearing the payment makes the bill pending again
  const cleared = await push(admin.token, [payOp(sale, [], 2)]);
  expect(statuses(cleared)).toEqual(["applied"]);
  saved = await saleOf(sale.data.id);
  expect(saved).toMatchObject({ paymentStatus: "pending", receivedPaise: 0 });
  expect(saved.paymentRecordedAt).toBeNull();
});

test("a payment for an unknown bill, or a wrong payment, is rejected and changes nothing", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant)]);
  await push(admin.token, [sale]);

  const missing = await push(admin.token, [
    {
      type: "sale.payment",
      data: { saleId: randomUUID(), payments: [], rev: 1 },
    },
  ]);
  expect(missing.body.results[0]).toMatchObject({
    status: "rejected",
    code: "SALE_MISSING",
  });

  const wrong = await push(admin.token, [
    payOp(sale, [{ method: "upi", amountPaise: 999999 }], 1),
  ]);
  expect(wrong.body.results[0]).toMatchObject({
    status: "rejected",
    code: "INVALID_PAYMENT",
  });
  expect((await saleOf(sale.data.id)).paymentStatus).toBe("pending");
});

test("a cashier can record the payment of their own bill, not of someone else's", async () => {
  const admin = await createUser();
  const till1 = await createUser({ username: "till1", role: "cashier" });
  const till2 = await createUser({ username: "till2", role: "cashier" });
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant)]);
  expect(statuses(await push(till1.token, [sale]))).toEqual(["applied"]);

  const pay = payOp(sale, [{ method: "cash", amountPaise: 79900 }], 1);
  const other = await push(till2.token, [pay]);
  expect(other.body.results[0]).toMatchObject({
    status: "rejected",
    code: "FORBIDDEN",
  });

  expect(statuses(await push(till1.token, [pay]))).toEqual(["applied"]);
  const change = payOp(sale, [{ method: "upi", amountPaise: 79900 }], 2);
  expect(statuses(await push(admin.token, [change]))).toEqual(["applied"]);
});

test("sending the same bill again after its payment was recorded is safe", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)]);
  await push(admin.token, [sale]);
  await push(admin.token, [
    payOp(sale, [{ method: "cash", amountPaise: 159800 }], 1),
  ]);

  const again = await push(admin.token, [sale]);

  expect(statuses(again)).toEqual(["duplicate"]);
  expect((await saleOf(sale.data.id)).paymentStatus).toBe("paid");
  expect(await stockOf(variant.id)).toBe(8);
});

// ----------------------------------------------------------- cancelled bills

test("a cancelled bill keeps its record, and the stock is put back only once", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant, 2)]);
  await push(admin.token, [sale]);
  expect(await stockOf(variant.id)).toBe(8);

  // The device sends the stock it put back as its own movement, then the cancellation.
  const putBack = stockOp(variant.id, 2, {
    type: "adjustment",
    reason: `Bill ${sale.data.invoiceNumber} cancelled (correction)`,
  });
  const cancel = cancelOp(sale, { replacedByInvoice: "INV-000099" });
  const res = await push(admin.token, [putBack, cancel]);

  expect(statuses(res)).toEqual(["applied", "applied"]);
  expect(await stockOf(variant.id)).toBe(10);
  expect(await saleOf(sale.data.id)).toMatchObject({
    status: "cancelled",
    cancelReason: "Wrong price",
    replacedByInvoice: "INV-000099",
  });

  const again = await push(admin.token, [cancel]);
  expect(statuses(again)).toEqual(["duplicate"]);
  expect(await stockOf(variant.id)).toBe(10);
});

test("cancelling an unknown bill is rejected, and a cashier cannot cancel", async () => {
  const admin = await createUser();
  const till = await createUser({ username: "till1", role: "cashier" });
  const { variant } = await catalog(admin.token);
  const sale = saleOp([line(variant)]);
  await push(admin.token, [sale]);

  const unknown = await push(admin.token, [
    {
      type: "sale.cancel",
      data: { saleId: randomUUID(), cancelledAt: now(), reason: "Wrong price" },
    },
  ]);
  expect(unknown.body.results[0]).toMatchObject({
    status: "rejected",
    code: "SALE_MISSING",
  });

  const denied = await push(till.token, [cancelOp(sale)]);
  expect(denied.body.results[0]).toMatchObject({
    status: "rejected",
    code: "FORBIDDEN",
  });
  expect((await saleOf(sale.data.id)).status).toBe("completed");
});

test("a corrected bill and the bill it replaces point at each other", async () => {
  const admin = await createUser();
  const { variant } = await catalog(admin.token);
  const first = saleOp([line(variant)]);
  const second = saleOp([line(variant)], {
    replacesSaleId: first.data.id,
    replacesInvoice: first.data.invoiceNumber,
  });
  await push(admin.token, [first]);

  const res = await push(admin.token, [
    cancelOp(first, {
      replacedBySaleId: second.data.id,
      replacedByInvoice: second.data.invoiceNumber,
    }),
    second,
  ]);

  expect(statuses(res)).toEqual(["applied", "applied"]);
  expect(await saleOf(first.data.id)).toMatchObject({
    status: "cancelled",
    replacedBySaleId: second.data.id,
    replacedByInvoice: second.data.invoiceNumber,
  });
  expect(await saleOf(second.data.id)).toMatchObject({
    status: "completed",
    replacesSaleId: first.data.id,
    replacesInvoice: first.data.invoiceNumber,
  });
});

// ------------------------------------------------------------------ indexes

test("the old unique indexes on SKU and on product + size are removed from an older database", async () => {
  await Variant.collection.createIndex(
    { sku: 1 },
    { unique: true, name: "sku_1" },
  );
  await Variant.collection.createIndex(
    { productId: 1, size: 1 },
    { unique: true, name: "productId_1_size_1" },
  );

  try {
    const before = (await Variant.collection.indexes()).map((i) => i.name);
    expect(before).toEqual(
      expect.arrayContaining(["sku_1", "productId_1_size_1"]),
    );

    await dropLegacyVariantIndexes();

    const after = (await Variant.collection.indexes()).map((i) => i.name);
    expect(after).not.toContain("sku_1");
    expect(after).not.toContain("productId_1_size_1");
    expect(after).toContain("barcode_1"); // the barcode stays unique

    await dropLegacyVariantIndexes(); // a second time does nothing
  } finally {
    for (const name of ["sku_1", "productId_1_size_1"]) {
      await Variant.collection.dropIndex(name).catch(() => {});
    }
  }
});
