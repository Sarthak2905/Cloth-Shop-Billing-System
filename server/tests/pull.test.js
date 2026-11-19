import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { Product } from "../src/models/Product.js";
import { StockMovement } from "../src/models/StockMovement.js";
import { Variant } from "../src/models/Variant.js";
import { initModels } from "../src/models/index.js";
import { Sale } from "../src/models/Sale.js";
import {
  makeCursor,
  pageSize,
  parseCursor,
} from "../src/services/pull.js";
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

const get = (path, token) => request(app).get(path).set(authHeader(token));
const post = (path, token, body = {}) =>
  request(app).post(path).set(authHeader(token)).send(body);
const patch = (path, token, body) =>
  request(app).patch(path).set(authHeader(token)).send(body);
const pull = (kind, token, query = "") =>
  get(`/api/sync/pull/${kind}${query}`, token);
const after = (cursor) => `after=${encodeURIComponent(cursor)}`;
// Changes made in the same millisecond have the same time: wait a little between steps.
const pause = () => new Promise((resolve) => setTimeout(resolve, 8));

// An online sale of `quantity` pieces, paid in cash.
async function sell(token, variant, quantity = 2) {
  const id = randomUUID();
  const res = await post("/api/sales", token, {
    id,
    lines: [
      {
        variantId: variant._id,
        quantity,
        unitPricePaise: variant.sellingPricePaise,
      },
    ],
    payments: [
      { method: "cash", amountPaise: variant.sellingPricePaise * quantity },
    ],
  });
  expect(res.status).toBe(201);
  return id;
}

// ------------------------------------------------------------------ helpers

test("a cursor is the change time and the id, and a bad one is refused", () => {
  const cursor = makeCursor("2026-11-19T10:00:00.000Z", "abc|def");

  expect(cursor).toBe("2026-11-19T10:00:00.000Z|abc|def");
  expect(parseCursor(cursor)).toEqual({
    time: new Date("2026-11-19T10:00:00.000Z"),
    id: "abc|def",
  });
  expect(parseCursor("")).toBeNull();
  expect(parseCursor(undefined)).toBeNull();
  for (const bad of ["garbage", "|id", "not-a-date|id", "2026-11-19T10:00:00.000Z|"]) {
    expect(() => parseCursor(bad)).toThrow("not valid");
  }
});

test("a page size is the default when nothing is asked, and never above the most for that kind", () => {
  expect(pageSize("products", undefined)).toBe(200);
  expect(pageSize("products", 9999)).toBe(500);
  expect(pageSize("products", 25)).toBe(25);
  expect(pageSize("sales", undefined)).toBe(50);
  expect(pageSize("sales", 500)).toBe(100);
  expect(pageSize("variants", 0)).toBe(200);
  expect(pageSize("movements", 1.5)).toBe(300);
});

test("the indexes that keep downloading fast are created", async () => {
  await initModels();

  const names = async (model) =>
    (await model.collection.indexes()).map((index) => index.name);
  expect(await names(Product)).toContain("updatedAt_1__id_1");
  expect(await names(Variant)).toContain("updatedAt_1__id_1");
  expect(await names(Sale)).toContain("updatedAt_1__id_1");
  expect(await names(StockMovement)).toContain("createdAt_1__id_1");
});

// ------------------------------------------------------------------- access

test("downloading needs an admin login", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });

  expect((await request(app).get("/api/sync/pull/products")).status).toBe(401);
  expect((await pull("products", cashier.token)).status).toBe(403);
  expect(
    (await get("/api/sync/pull-summary", cashier.token)).status,
  ).toBe(403);
});

test("an unknown kind, a bad cursor and a bad page size are refused", async () => {
  const admin = await createUser();

  expect((await pull("secrets", admin.token)).status).toBe(404);
  expect((await pull("toString", admin.token)).status).toBe(404);
  expect((await pull("products", admin.token, "?after=garbage")).status).toBe(400);
  expect((await pull("products", admin.token, "?limit=0")).status).toBe(400);
  expect((await pull("products", admin.token, "?limit=501")).status).toBe(400);
  expect((await pull("products", admin.token, "?limit=abc")).status).toBe(400);
});

// ----------------------------------------------------------------- products

test("products come in pages, oldest change first, and each page continues where the last ended", async () => {
  const admin = await createUser();
  for (const name of ["A", "B", "C", "D", "E"]) {
    await makeProduct({ name });
    await pause();
  }

  const first = await pull("products", admin.token, "?limit=2");
  expect(first.status).toBe(200);
  expect(first.body.items.map((p) => p.name)).toEqual(["A", "B"]);
  expect(first.body.hasMore).toBe(true);
  expect(first.body.serverTime).toEqual(expect.any(String));

  const second = await pull("products", admin.token, `?limit=2&${after(first.body.cursor)}`);
  expect(second.body.items.map((p) => p.name)).toEqual(["C", "D"]);
  expect(second.body.hasMore).toBe(true);

  const third = await pull("products", admin.token, `?limit=2&${after(second.body.cursor)}`);
  expect(third.body.items.map((p) => p.name)).toEqual(["E"]);
  expect(third.body.hasMore).toBe(false);

  const none = await pull("products", admin.token, `?limit=2&${after(third.body.cursor)}`);
  expect(none.body.items).toEqual([]);
  expect(none.body.hasMore).toBe(false);
  expect(none.body.cursor).toBe(third.body.cursor);
});

test("a product carries everything the app stores, including the discount setting and archived ones", async () => {
  const admin = await createUser();
  const product = await makeProduct({
    name: "Lining",
    category: "Fabric",
    brand: "Raymond",
    discountAllowed: false,
  });
  await pause();
  await post(`/api/products/${product._id}/archive`, admin.token);

  const res = await pull("products", admin.token);

  expect(res.body.items).toHaveLength(1);
  expect(res.body.items[0]).toMatchObject({
    id: product._id,
    name: "Lining",
    category: "Fabric",
    brand: "Raymond",
    discountAllowed: false,
    status: "archived",
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
});

test("a product that was edited comes again, and nothing else does", async () => {
  const admin = await createUser();
  const product = await makeProduct({ name: "Old name" });
  await makeProduct({ name: "Other" });
  const before = await pull("products", admin.token);
  expect(before.body.items).toHaveLength(2);

  await pause();
  const edit = await patch(`/api/products/${product._id}`, admin.token, { name: "New name" });
  expect(edit.status).toBe(200);

  const changed = await pull("products", admin.token, `?${after(before.body.cursor)}`);
  // the cursor is at the newest row, so only changes made after it come
  expect(changed.body.items.map((p) => p.name)).toEqual(["New name"]);
});

test("rows changed in the same millisecond are neither skipped nor repeated", async () => {
  const admin = await createUser();
  for (const name of ["A", "B", "C"]) await makeProduct({ name });
  await Product.collection.updateMany(
    {},
    { $set: { updatedAt: new Date("2026-11-01T10:00:00.000Z") } },
  );

  const seen = [];
  let cursor = "";
  for (let i = 0; i < 6; i += 1) {
    const res = await pull("products", admin.token, `?limit=1${cursor ? `&${after(cursor)}` : ""}`);
    seen.push(...res.body.items.map((p) => p.name));
    cursor = res.body.cursor;
    if (!res.body.hasMore) break;
  }

  expect(seen).toHaveLength(3);
  expect(new Set(seen)).toEqual(new Set(["A", "B", "C"]));
});

// ----------------------------------------------------------------- variants

test("an item carries its cost, unit and box size, and comes again when its stock changes", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, {
    costPaise: 31000,
    unit: "meter",
    packSize: 10,
    currentStock: 5,
    size: "",
  });

  const first = await pull("variants", admin.token);
  expect(first.body.items).toHaveLength(1);
  expect(first.body.items[0]).toMatchObject({
    id: variant._id,
    productId: product._id,
    barcode: variant.barcode,
    size: "",
    unit: "meter",
    packSize: 10,
    costPaise: 31000,
    sellingPricePaise: 79900,
    currentStock: 5,
    status: "active",
  });

  await pause();
  const adjust = await post(`/api/variants/${variant._id}/stock-adjustments`, admin.token, {
    quantityChange: 3,
    reason: "Found more",
  });
  expect(adjust.status).toBe(201);

  const again = await pull("variants", admin.token, `?${after(first.body.cursor)}`);
  expect(again.body.items).toHaveLength(1);
  expect(again.body.items[0]).toMatchObject({ id: variant._id, currentStock: 8 });
});

test("a sale changes the stock of its item, so the item comes again", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, { currentStock: 10 });
  const first = await pull("variants", admin.token);

  await pause();
  await sell(admin.token, variant, 3);

  const again = await pull("variants", admin.token, `?${after(first.body.cursor)}`);
  expect(again.body.items.map((v) => [v.id, v.currentStock])).toEqual([[variant._id, 7]]);
});

test("archiving a product archives its items, and they come again as archived", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  await makeVariant(product._id);
  const first = await pull("variants", admin.token);

  await pause();
  await post(`/api/products/${product._id}/archive`, admin.token);

  const again = await pull("variants", admin.token, `?${after(first.body.cursor)}`);
  expect(again.body.items.map((v) => v.status)).toEqual(["archived"]);
});

// -------------------------------------------------------------------- sales

test("a bill comes with its items, cost and payment, and again when its payment or status changes", async () => {
  const admin = await createUser();
  const product = await makeProduct({ name: "Cotton Shirt" });
  const variant = await makeVariant(product._id, { costPaise: 30000 });
  const saleId = await sell(admin.token, variant, 2);

  const first = await pull("sales", admin.token);
  expect(first.body.items).toHaveLength(1);
  const sale = first.body.items[0];
  expect(sale).toMatchObject({
    id: saleId,
    status: "completed",
    paymentStatus: "paid",
    totalPaise: 159800,
    itemCount: 2,
    receivedPaise: 159800,
    shortPaise: 0,
    soldAt: expect.any(String),
    updatedAt: expect.any(String),
  });
  expect(sale.payments).toEqual([{ method: "cash", amountPaise: 159800, reference: "" }]);
  expect(sale.items).toHaveLength(1);
  expect(sale.items[0]).toMatchObject({
    variantId: variant._id,
    productName: "Cotton Shirt",
    quantity: 2,
    unit: "piece",
    unitPricePaise: 79900,
    costPaise: 30000,
    lineTotalPaise: 159800,
  });

  // the payment is cleared later: the bill is pending again
  await pause();
  const cleared = await post("/api/sync/push", admin.token, {
    ops: [{ type: "sale.payment", data: { saleId, payments: [], rev: 1 } }],
  });
  expect(cleared.body.results[0].status).toBe("applied");
  const paymentChange = await pull("sales", admin.token, `?${after(first.body.cursor)}`);
  expect(paymentChange.body.items).toHaveLength(1);
  expect(paymentChange.body.items[0]).toMatchObject({
    id: saleId,
    paymentStatus: "pending",
    receivedPaise: 0,
  });

  // the bill is cancelled later
  await pause();
  const cancelled = await post("/api/sync/push", admin.token, {
    ops: [
      {
        type: "sale.cancel",
        data: { saleId, cancelledAt: new Date().toISOString(), reason: "Wrong price" },
      },
    ],
  });
  expect(cancelled.body.results[0].status).toBe("applied");
  const cancelChange = await pull("sales", admin.token, `?${after(paymentChange.body.cursor)}`);
  expect(cancelChange.body.items[0]).toMatchObject({
    id: saleId,
    status: "cancelled",
    cancelReason: "Wrong price",
  });
});

test("bills come in pages too, with their items each time", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, { currentStock: 20 });
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    ids.push(await sell(admin.token, variant, 1));
    await pause();
  }

  const first = await pull("sales", admin.token, "?limit=2");
  expect(first.body.items.map((s) => s.id)).toEqual(ids.slice(0, 2));
  expect(first.body.hasMore).toBe(true);
  expect(first.body.items.every((s) => s.items.length === 1)).toBe(true);

  const second = await pull("sales", admin.token, `?limit=2&${after(first.body.cursor)}`);
  expect(second.body.items.map((s) => s.id)).toEqual([ids[2]]);
  expect(second.body.hasMore).toBe(false);
});

// ---------------------------------------------------------------- movements

test("stock records come in the order they happened, including the ones made by sales", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, { currentStock: 10 });
  await post(`/api/variants/${variant._id}/stock-adjustments`, admin.token, {
    quantityChange: 4,
    reason: "Found more",
  });
  await pause();
  const saleId = await sell(admin.token, variant, 2);

  const res = await pull("movements", admin.token);

  expect(res.body.items.map((m) => m.type)).toEqual(["adjustment", "sale"]);
  expect(res.body.items[0]).toMatchObject({
    variantId: variant._id,
    quantityChange: 4,
    stockAfter: 14,
    reason: "Found more",
  });
  expect(res.body.items[1]).toMatchObject({
    quantityChange: -2,
    stockAfter: 12,
    referenceId: saleId,
    occurredAt: expect.any(String),
    createdAt: expect.any(String),
  });

  const none = await pull("movements", admin.token, `?${after(res.body.cursor)}`);
  expect(none.body.items).toEqual([]);
});

// ------------------------------------------------------------------ summary

test("the summary says how much there is to download", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id);
  await sell(admin.token, variant, 1);

  const res = await get("/api/sync/pull-summary", admin.token);

  expect(res.status).toBe(200);
  expect(res.body.counts).toEqual({ products: 1, variants: 1, sales: 1, movements: 1 });
  expect(res.body.serverTime).toEqual(expect.any(String));
});