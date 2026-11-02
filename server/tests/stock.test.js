import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { runInTransaction } from "../src/db/transaction.js";
import { getShopSettings } from "../src/models/Settings.js";
import { StockMovement } from "../src/models/StockMovement.js";
import { Variant } from "../src/models/Variant.js";
import { applyStockChange } from "../src/services/stock.js";
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adjust = (token, variantId, body) =>
  request(app)
    .post(`/api/variants/${variantId}/stock-adjustments`)
    .set(authHeader(token))
    .send(body);

async function setup(stock = 10) {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, { currentStock: stock });
  return { admin, variant };
}

const stockOf = async (variant) =>
  (await Variant.findById(variant._id)).currentStock;

test("an admin adjusts stock with a reason and every change is recorded", async () => {
  const { admin, variant } = await setup(10);

  const add = await adjust(admin.token, variant._id, {
    quantityChange: 5,
    reason: "Delivery from supplier",
  });
  expect(add.status).toBe(201);
  expect(add.body.variant.currentStock).toBe(15);
  expect(add.body.movement).toMatchObject({
    type: "adjustment",
    quantityChange: 5,
    stockAfter: 15,
    reason: "Delivery from supplier",
  });

  const remove = await adjust(admin.token, variant._id, {
    quantityChange: -3,
    reason: "Damaged",
  });
  expect(remove.body.variant.currentStock).toBe(12);
  expect(await StockMovement.countDocuments({ variantId: variant._id })).toBe(
    2,
  );
});

test("a reason is required and the quantity must be a non-zero whole number", async () => {
  const { admin, variant } = await setup();
  const bad = [
    { quantityChange: 5 },
    { quantityChange: 5, reason: "ab" },
    { quantityChange: 0, reason: "Recount" },
    { quantityChange: 1.5, reason: "Recount" },
    { quantityChange: "5", reason: "Recount" },
    { quantityChange: 5, reason: "Recount", type: "sale" },
  ];
  for (const body of bad) {
    expect((await adjust(admin.token, variant._id, body)).status).toBe(400);
  }
  expect(await stockOf(variant)).toBe(10);
  expect(await StockMovement.countDocuments()).toBe(0);
});

test("stock cannot go below zero, and a refused change leaves nothing behind", async () => {
  const { admin, variant } = await setup(2);

  const res = await adjust(admin.token, variant._id, {
    quantityChange: -5,
    reason: "Sold",
  });

  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  expect(res.body.error.message).toContain("Only 2");
  expect(await stockOf(variant)).toBe(2);
  expect(await StockMovement.countDocuments()).toBe(0);
});

test("stock may go negative when the shop setting allows it", async () => {
  const { admin, variant } = await setup(2);
  const settings = await getShopSettings();
  settings.allowNegativeStock = true;
  await settings.save();

  const res = await adjust(admin.token, variant._id, {
    quantityChange: -5,
    reason: "Sold",
  });

  expect(res.status).toBe(201);
  expect(res.body.variant.currentStock).toBe(-3);
});

test("a cashier cannot adjust stock or read movements, and an anonymous caller is refused", async () => {
  const { variant } = await setup();
  const cashier = await createUser({ username: "till1", role: "cashier" });

  expect(
    (
      await adjust(cashier.token, variant._id, {
        quantityChange: 1,
        reason: "Found one",
      })
    ).status,
  ).toBe(403);
  expect(
    (await request(app).get(`/api/variants/${variant._id}/stock-movements`))
      .status,
  ).toBe(401);
  expect(
    (
      await request(app)
        .get(`/api/variants/${variant._id}/stock-movements`)
        .set(authHeader(cashier.token))
    ).status,
  ).toBe(403);
});

test("movements are listed newest first with pagination, for admins", async () => {
  const { admin, variant } = await setup(10);
  for (const [change, reason] of [
    [1, "First"],
    [2, "Second"],
    [3, "Third"],
  ]) {
    await adjust(admin.token, variant._id, { quantityChange: change, reason });
    await wait(5);
  }

  const res = await request(app)
    .get(`/api/variants/${variant._id}/stock-movements?limit=2`)
    .set(authHeader(admin.token));

  expect(res.status).toBe(200);
  expect(res.body.total).toBe(3);
  expect(res.body.items.map((m) => m.reason)).toEqual(["Third", "Second"]);
});

test("simultaneous removals can never oversell", async () => {
  const { admin, variant } = await setup(3);

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      adjust(admin.token, variant._id, {
        quantityChange: -1,
        reason: "Sold at counter",
      }),
    ),
  );

  const statuses = results.map((r) => r.status);
  expect(statuses.filter((s) => s === 201)).toHaveLength(3);
  expect(statuses.filter((s) => s === 409)).toHaveLength(2);
  expect(await stockOf(variant)).toBe(0);
  expect(await StockMovement.countDocuments({ variantId: variant._id })).toBe(
    3,
  );
});

test("a stock change is undone with its transaction if something fails afterwards", async () => {
  const { variant } = await setup(10);

  await expect(
    runInTransaction(async (session) => {
      await applyStockChange({
        variantId: variant._id,
        quantityChange: -4,
        type: "adjustment",
        reason: "Test",
        session,
      });
      throw new Error("something failed later");
    }),
  ).rejects.toThrow("something failed later");

  expect(await stockOf(variant)).toBe(10);
  expect(await StockMovement.countDocuments()).toBe(0);
});

test("adjusting or listing movements for an unknown variant gives 404", async () => {
  const { admin } = await setup();

  expect(
    (
      await adjust(admin.token, "missing", {
        quantityChange: 1,
        reason: "Recount",
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .get("/api/variants/missing/stock-movements")
        .set(authHeader(admin.token))
    ).status,
  ).toBe(404);
});
