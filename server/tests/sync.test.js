import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Product } from "../src/models/Product.js";
import { Sale } from "../src/models/Sale.js";
import { StockMovement } from "../src/models/StockMovement.js";
import { Variant } from "../src/models/Variant.js";
import {
  authHeader,
  clearDatabase,
  createUser,
  startTestDatabase,
  stopTestDatabase,
  testConfig,
} from "./helpers/testApp.js";
import { makeProduct, makeVariant } from "./helpers/catalog.js";

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
    sku: "SHIRT-M",
    barcode: "CLO000001",
    size: "M",
    costPaise: 30000,
    mrpPaise: 99900,
    sellingPricePaise: 79900,
    taxRatePercent: 5,
    priceIncludesTax: true,
    reorderThreshold: 3,
    status: "active",
    ...over,
  },
});

const movementOp = (variantId, over = {}) => ({
  type: "stock.movement",
  data: {
    id: randomUUID(),
    variantId,
    type: "opening",
    quantityChange: 10,
    reason: "Opening stock",
    createdAt: new Date().toISOString(),
    ...over,
  },
});

const saleOp = (variantId, over = {}) => ({
  type: "sale.create",
  data: {
    id: randomUUID(),
    invoiceNumber: "INV-000001",
    soldAt: new Date().toISOString(),
    lines: [{ variantId, quantity: 1, unitPricePaise: 79900 }],
    payment: { method: "cash" },
    ...over,
  },
});

const stockOf = async (id) => (await Variant.findById(id)).currentStock;

test("syncing needs a login, and only admins may sync catalogue changes", async () => {
  expect(
    (await request(app).post("/api/sync/push").send({ ops: [] })).status,
  ).toBe(401);

  const cashier = await createUser({ username: "till1", role: "cashier" });
  const product = await makeProduct();
  const variant = await makeVariant(product._id);

  const res = await push(cashier.token, [productOp(), saleOp(variant._id)]);

  expect(statuses(res)).toEqual(["rejected", "applied"]);
  expect(res.body.results[0].code).toBe("FORBIDDEN");
  expect(await Product.countDocuments()).toBe(1); // only the one made by the test set-up
});

test("a badly shaped batch is refused as a whole", async () => {
  const admin = await createUser();
  const send = (body) =>
    request(app).post("/api/sync/push").set(authHeader(admin.token)).send(body);

  expect((await send({})).status).toBe(400);
  expect((await send({ ops: [] })).status).toBe(400);
  expect((await send({ ops: "nope" })).status).toBe(400);
  expect(
    (await send({ ops: Array.from({ length: 51 }, () => productOp()) })).status,
  ).toBe(400);
});

test("pushes a product and an item, and pushing them again changes nothing", async () => {
  const admin = await createUser();
  const product = productOp();
  const ops = [product, variantOp(product.data.id)];

  const first = await push(admin.token, ops);
  expect(statuses(first)).toEqual(["applied", "applied"]);
  expect(first.body.results[0]).toMatchObject({ created: true, changed: true });

  const second = await push(admin.token, ops);
  expect(statuses(second)).toEqual(["applied", "applied"]);
  expect(second.body.results[0]).toMatchObject({
    created: false,
    changed: false,
  });
  expect(await Product.countDocuments()).toBe(1);
  expect(await Variant.countDocuments()).toBe(1);
});

test("an item update changes catalogue fields but never the stock", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, {
    currentStock: 7,
    sellingPricePaise: 79900,
  });

  const update = variantOp(product._id, {
    id: variant._id,
    sku: variant.sku,
    barcode: variant.barcode,
    sellingPricePaise: 70000,
    status: "archived",
  });
  const res = await push(admin.token, [update]);

  expect(statuses(res)).toEqual(["applied"]);
  const saved = await Variant.findById(variant._id);
  expect(saved.sellingPricePaise).toBe(70000);
  expect(saved.status).toBe("archived");
  expect(saved.currentStock).toBe(7);

  const moved = variantOp(randomUUID(), {
    id: variant._id,
    sku: variant.sku,
    barcode: variant.barcode,
  });
  const otherProduct = await makeProduct({ name: "Other" });
  moved.data.productId = otherProduct._id;
  const rejected = await push(admin.token, [moved]);
  expect(rejected.body.results[0]).toMatchObject({
    status: "rejected",
    code: "IMMUTABLE_FIELD",
  });
});

test("an opening stock movement sets the stock and the same movement counts only once", async () => {
  const admin = await createUser();
  const product = productOp();
  const variant = variantOp(product.data.id);
  const happenedAt = "2026-10-30T09:15:00.000Z";
  const movement = movementOp(variant.data.id, { createdAt: happenedAt });

  const first = await push(admin.token, [product, variant, movement]);
  expect(statuses(first)).toEqual(["applied", "applied", "applied"]);
  expect(await stockOf(variant.data.id)).toBe(10);

  const again = await push(admin.token, [movement]);
  expect(statuses(again)).toEqual(["duplicate"]);
  expect(await stockOf(variant.data.id)).toBe(10);

  const saved = await StockMovement.findById(movement.data.id);
  expect(saved.occurredAt.toISOString()).toBe(happenedAt);
  expect(await StockMovement.countDocuments()).toBe(1);
});

test("a movement for an unknown item is rejected, not retried", async () => {
  const admin = await createUser();
  const res = await push(admin.token, [movementOp("ghost")]);
  expect(res.body.results[0]).toMatchObject({
    status: "rejected",
    code: "NOT_FOUND",
  });
});

test("a whole device batch in order leaves the server stock equal to the device stock", async () => {
  const admin = await createUser();
  const product = productOp();
  const variant = variantOp(product.data.id);

  const res = await push(admin.token, [
    product,
    variant,
    movementOp(variant.data.id, { quantityChange: 10 }),
    saleOp(variant.data.id, {
      lines: [
        { variantId: variant.data.id, quantity: 2, unitPricePaise: 79900 },
      ],
    }),
  ]);

  expect(statuses(res)).toEqual(["applied", "applied", "applied", "applied"]);
  expect(await stockOf(variant.data.id)).toBe(8);

  const sale = await Sale.findOne();
  expect(sale.invoiceNumber).toBe("INV-000001");
  expect(sale.flagged).toBe(false);
  expect(sale.source).toBe("offline-sync");
  expect(await StockMovement.countDocuments()).toBe(2); // the opening and the sale
});

test("a synced sale is saved even when stock is short, and is flagged", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, { currentStock: 1 });

  const res = await push(admin.token, [
    saleOp(variant._id, {
      lines: [{ variantId: variant._id, quantity: 3, unitPricePaise: 79900 }],
    }),
  ]);

  expect(statuses(res)).toEqual(["applied"]);
  expect(res.body.results[0].flags).toContain("STOCK_SHORTFALL");
  expect(await stockOf(variant._id)).toBe(-2);
});

test("a sale for an unknown item is rejected, and the sales after it still go through", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id);

  const res = await push(admin.token, [
    saleOp("ghost-item", {
      lines: [{ variantId: "ghost-item", quantity: 1, unitPricePaise: 100 }],
    }),
    saleOp(variant._id, { invoiceNumber: "INV-000002" }),
  ]);

  expect(statuses(res)).toEqual(["rejected", "applied"]);
  expect(res.body.results[0].code).toBe("UNKNOWN_VARIANT");
  expect(await Sale.countDocuments()).toBe(1);
});

test("one invalid operation does not fail the rest of the batch", async () => {
  const admin = await createUser();
  const res = await push(admin.token, [
    { type: "product.upsert", data: { name: "" } },
    productOp(),
    { type: "mystery.op", data: {} },
  ]);

  expect(statuses(res)).toEqual(["rejected", "applied", "rejected"]);
  expect(res.body.results[0].code).toBe("VALIDATION_ERROR");
  expect(res.body.results[2].code).toBe("UNSUPPORTED_TYPE");
  expect(await Product.countDocuments()).toBe(1);
});

test("a barcode already used by a different item on the server is reported as a conflict", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  await makeVariant(product._id, {
    barcode: "CLO000001",
    sku: "SERVER-ONE",
    size: "M",
  });

  const res = await push(admin.token, [
    variantOp(product._id, {
      barcode: "CLO000001",
      sku: "DEVICE-ONE",
      size: "L",
    }),
  ]);

  expect(res.body.results[0]).toMatchObject({
    status: "rejected",
    code: "DUPLICATE_BARCODE",
  });
  expect(await Variant.countDocuments()).toBe(1);
});

test("sending a whole batch again is safe", async () => {
  const admin = await createUser();
  const product = productOp();
  const variant = variantOp(product.data.id);
  const batch = [
    product,
    variant,
    movementOp(variant.data.id),
    saleOp(variant.data.id),
  ];

  await push(admin.token, batch);
  const again = await push(admin.token, batch);

  expect(statuses(again)).toEqual([
    "applied",
    "applied",
    "duplicate",
    "duplicate",
  ]);
  expect(await stockOf(variant.data.id)).toBe(9);
  expect(await Sale.countDocuments()).toBe(1);
  expect(await StockMovement.countDocuments()).toBe(2);
});

test("an invoice number cannot be used by two different sales, and the refused sale changes nothing", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, { currentStock: 10 });

  const res = await push(admin.token, [
    saleOp(variant._id, { invoiceNumber: "INV-000001" }),
    saleOp(variant._id, { invoiceNumber: "INV-000001" }),
  ]);

  expect(statuses(res)).toEqual(["applied", "rejected"]);
  expect(res.body.results[1].code).toBe("INVOICE_NUMBER_TAKEN");
  expect(await Sale.countDocuments()).toBe(1);
  expect(await stockOf(variant._id)).toBe(9);
});

test("stock levels are available to admins only and match the server stock", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });
  const product = await makeProduct();
  const variant = await makeVariant(product._id, {
    sku: "SHIRT-M",
    currentStock: 7,
  });

  const levels = await request(app)
    .get("/api/sync/stock-levels")
    .set(authHeader(admin.token));
  expect(levels.status).toBe(200);
  expect(levels.body.items).toEqual([
    {
      variantId: variant._id,
      sku: "SHIRT-M",
      currentStock: 7,
      status: "active",
    },
  ]);

  const denied = await request(app)
    .get("/api/sync/stock-levels")
    .set(authHeader(cashier.token));
  expect(denied.status).toBe(403);
});

test("the status endpoint gives the server time and counts to any logged-in user", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });
  await makeProduct();

  expect((await request(app).get("/api/sync/status")).status).toBe(401);

  const res = await request(app)
    .get("/api/sync/status")
    .set(authHeader(cashier.token));
  expect(res.status).toBe(200);
  expect(
    Math.abs(Date.now() - new Date(res.body.serverTime).getTime()),
  ).toBeLessThan(5000);
  expect(res.body.counts).toMatchObject({ products: 1, variants: 0, sales: 0 });
});

test("sync activity is written to the audit log", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id);

  await push(admin.token, [saleOp(variant._id)]);

  const sale = await AuditLog.findOne({ action: "sale.created" }).lean();
  expect(sale.details.source).toBe("offline-sync");

  const batch = await AuditLog.findOne({ action: "sync.push" }).lean();
  expect(batch.details).toMatchObject({ total: 1, applied: 1, rejected: 0 });
});
