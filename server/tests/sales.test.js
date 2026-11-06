import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { calculateTotals } from "../src/domain/calc.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Sale } from "../src/models/Sale.js";
import { getShopSettings } from "../src/models/Settings.js";
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
let shirt;
let jeans;

beforeAll(async () => {
  await startTestDatabase();
  app = createApp(testConfig());
});

afterAll(stopTestDatabase);

beforeEach(async () => {
  await clearDatabase();
  const shirtProduct = await makeProduct({ name: "Cotton Shirt" });
  shirt = await makeVariant(shirtProduct._id, {
    sku: "SHIRT-M",
    barcode: "CLO000001",
    size: "M",
    costPaise: 30000,
    mrpPaise: 99900,
    sellingPricePaise: 79900,
    currentStock: 10,
  });
  const jeansProduct = await makeProduct({
    name: "Denim Jeans",
    category: "Jeans",
  });
  jeans = await makeVariant(jeansProduct._id, {
    sku: "JEANS-32",
    barcode: "CLO000002",
    size: "32",
    costPaise: 55000,
    mrpPaise: 159900,
    sellingPricePaise: 129900,
    currentStock: 5,
  });
});

const sell = (token, payload) =>
  request(app).post("/api/sales").set(authHeader(token)).send(payload);
const getAs = (path, token) => request(app).get(path).set(authHeader(token));
const line = (variant, quantity = 1, extra = {}) => ({
  variantId: variant._id,
  quantity,
  unitPricePaise: variant.sellingPricePaise,
  ...extra,
});
const body = (lines, over = {}) => ({
  id: randomUUID(),
  lines,
  payment: { method: "cash" },
  ...over,
});
const stockOf = async (variant) =>
  (await Variant.findById(variant._id)).currentStock;
const codes = (res) => res.body.error.details.map((d) => d.code);
const percent = (value) => ({ billDiscount: { type: "percent", value } });

test("saves a sale with server-calculated totals, item snapshots and one stock movement", async () => {
  const admin = await createUser();
  const res = await sell(admin.token, body([line(shirt)]));

  expect(res.status).toBe(201);
  expect(res.body.duplicate).toBe(false);
  const { sale } = res.body;
  expect(sale).toMatchObject({
    invoiceNumber: "INV-S000001",
    status: "completed",
    source: "online",
    itemCount: 1,
    subtotalPaise: 79900,
    taxPaise: 3805,
    totalPaise: 79900,
    flagged: false,
  });
  expect(sale.items[0]).toMatchObject({
    productName: "Cotton Shirt",
    sku: "SHIRT-M",
    barcode: "CLO000001",
    size: "M",
    quantity: 1,
    unitPricePaise: 79900,
    lineTotalPaise: 79900,
  });
  expect(sale.payment).toMatchObject({
    method: "cash",
    amountTenderedPaise: 79900,
    changePaise: 0,
  });

  expect(await stockOf(shirt)).toBe(9);
  const movements = await StockMovement.find({ type: "sale" });
  expect(movements).toHaveLength(1);
  expect(movements[0]).toMatchObject({
    variantId: shirt._id,
    quantityChange: -1,
    stockAfter: 9,
    referenceId: sale.id,
  });
});

test("a 10% bill discount gives the same total as the app", async () => {
  const admin = await createUser();
  const res = await sell(
    admin.token,
    body([line(shirt)], {
      ...percent(10),
      claimedTotalPaise: 71900,
      payment: { method: "cash", amountTenderedPaise: 80000 },
    }),
  );

  expect(res.status).toBe(201);
  expect(res.body.sale).toMatchObject({
    discountPaise: 7990,
    billDiscountPaise: 7990,
    taxPaise: 3424,
    exactTotalPaise: 71910,
    roundOffPaise: -10,
    totalPaise: 71900,
    flagged: false,
  });
  expect(res.body.sale.payment.changePaise).toBe(8100);
});

test("two lines with item and bill discounts match the shared calculation", async () => {
  const admin = await createUser();
  const lines = [
    line(shirt, 2, { discount: { type: "percent", value: 5 } }),
    line(jeans, 1),
  ];
  const res = await sell(
    admin.token,
    body(lines, { billDiscount: { type: "amount", value: 5000 } }),
  );

  const expected = calculateTotals({
    lines: [
      {
        variantId: shirt._id,
        unitPricePaise: 79900,
        quantity: 2,
        taxRatePercent: 5,
        priceIncludesTax: true,
        discount: { type: "percent", value: 5 },
      },
      {
        variantId: jeans._id,
        unitPricePaise: 129900,
        quantity: 1,
        taxRatePercent: 5,
        priceIncludesTax: true,
        discount: null,
      },
    ],
    billDiscount: { type: "amount", value: 5000 },
  });

  expect(res.status).toBe(201);
  expect(res.body.sale).toMatchObject({
    itemCount: 3,
    subtotalPaise: expected.subtotalPaise,
    discountPaise: expected.discountPaise,
    taxPaise: expected.taxPaise,
    totalPaise: expected.totalPaise,
  });
  expect(res.body.sale.items.map((i) => i.lineNumber)).toEqual([1, 2]);
  expect(await stockOf(shirt)).toBe(8);
  expect(await stockOf(jeans)).toBe(4);
});

test("the client cannot dictate totals", async () => {
  const admin = await createUser();

  const dictated = await sell(admin.token, {
    ...body([line(shirt)]),
    totalPaise: 1,
  });
  expect(dictated.status).toBe(400);

  const mismatch = await sell(
    admin.token,
    body([line(shirt)], { claimedTotalPaise: 1000 }),
  );
  expect(mismatch.status).toBe(422);
  expect(mismatch.body.error.code).toBe("SALE_NOT_ALLOWED");
  expect(codes(mismatch)).toContain("TOTAL_MISMATCH");

  expect(await Sale.countDocuments()).toBe(0);
  expect(await stockOf(shirt)).toBe(10);
});

test("cash gives change, and too little cash is refused with nothing saved", async () => {
  const admin = await createUser();

  const ok = await sell(
    admin.token,
    body([line(shirt)], {
      payment: { method: "cash", amountTenderedPaise: 100000 },
    }),
  );
  expect(ok.body.sale.payment).toMatchObject({
    amountTenderedPaise: 100000,
    changePaise: 20100,
  });

  const short = await sell(
    admin.token,
    body([line(shirt)], {
      payment: { method: "cash", amountTenderedPaise: 50000 },
    }),
  );
  expect(short.status).toBe(400);
  expect(short.body.error.code).toBe("INSUFFICIENT_PAYMENT");
  expect(await Sale.countDocuments()).toBe(1);
  expect(await stockOf(shirt)).toBe(9);
});

test("UPI and card payments are recorded at the exact total", async () => {
  const admin = await createUser();

  const upi = await sell(
    admin.token,
    body([line(shirt)], { payment: { method: "upi", reference: "UPI12345" } }),
  );
  expect(upi.body.sale.payment).toEqual({
    method: "upi",
    amountTenderedPaise: 79900,
    changePaise: 0,
    reference: "UPI12345",
  });

  const card = await sell(
    admin.token,
    body([line(shirt)], { payment: { method: "card" } }),
  );
  expect(card.body.sale.payment).toEqual({
    method: "card",
    amountTenderedPaise: 79900,
    changePaise: 0,
    reference: "",
  });
});

test("server invoice numbers increase and follow the shop prefix", async () => {
  const admin = await createUser();
  const first = await sell(admin.token, body([line(shirt)]));
  const second = await sell(admin.token, body([line(shirt)]));

  const settings = await getShopSettings();
  settings.invoicePrefix = "SF";
  await settings.save();
  const third = await sell(admin.token, body([line(shirt)]));

  expect(first.body.sale.invoiceNumber).toBe("INV-S000001");
  expect(second.body.sale.invoiceNumber).toBe("INV-S000002");
  expect(third.body.sale.invoiceNumber).toBe("SF-S000003");
});

test("an invoice number from the device is kept, cannot be reused, and must have a valid format", async () => {
  const admin = await createUser();

  const kept = await sell(
    admin.token,
    body([line(shirt)], { invoiceNumber: "INV-000007" }),
  );
  expect(kept.status).toBe(201);
  expect(kept.body.sale.invoiceNumber).toBe("INV-000007");

  const taken = await sell(
    admin.token,
    body([line(shirt)], { invoiceNumber: "INV-000007" }),
  );
  expect(taken.status).toBe(409);
  expect(taken.body.error.code).toBe("INVOICE_NUMBER_TAKEN");
  expect(await Sale.countDocuments()).toBe(1);
  expect(await stockOf(shirt)).toBe(9);

  for (const bad of ["inv 7", "INV-S000001", "TOOLONGPREFIX-1"]) {
    expect(
      (await sell(admin.token, body([line(shirt)], { invoiceNumber: bad })))
        .status,
    ).toBe(400);
  }

  // The device's series never touches the server's series.
  const generated = await sell(admin.token, body([line(shirt)]));
  expect(generated.body.sale.invoiceNumber).toBe("INV-S000001");
});

test("sending the same sale twice saves it once", async () => {
  const admin = await createUser();
  const payload = body([line(shirt)]);

  const first = await sell(admin.token, payload);
  const second = await sell(admin.token, payload);

  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.body.duplicate).toBe(true);
  expect(second.body.sale.invoiceNumber).toBe(first.body.sale.invoiceNumber);
  expect(await Sale.countDocuments()).toBe(1);
  expect(await stockOf(shirt)).toBe(9);
  expect(await StockMovement.countDocuments({ type: "sale" })).toBe(1);
});

test("the same sale id with different contents is refused", async () => {
  const admin = await createUser();
  const id = randomUUID();
  await sell(admin.token, { ...body([line(shirt, 1)]), id });

  const changed = await sell(admin.token, { ...body([line(shirt, 2)]), id });

  expect(changed.status).toBe(409);
  expect(changed.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  expect(await stockOf(shirt)).toBe(9);
});

test("simultaneous identical requests create exactly one sale", async () => {
  const admin = await createUser();
  const payload = body([line(shirt)]);

  const results = await Promise.all(
    Array.from({ length: 4 }, () => sell(admin.token, payload)),
  );

  expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
  expect(new Set(results.map((r) => r.body.sale.invoiceNumber)).size).toBe(1);
  expect(await Sale.countDocuments()).toBe(1);
  expect(await stockOf(shirt)).toBe(9);
});

test("simultaneous different sales can never sell the last unit twice", async () => {
  const admin = await createUser();
  await Variant.updateOne({ _id: shirt._id }, { currentStock: 1 });

  const results = await Promise.all(
    Array.from({ length: 3 }, () => sell(admin.token, body([line(shirt)]))),
  );

  const statuses = results.map((r) => r.status);
  expect(statuses.filter((s) => s === 201)).toHaveLength(1);
  expect(statuses.filter((s) => s === 409)).toHaveLength(2);
  expect(await stockOf(shirt)).toBe(0);
  expect(await Sale.countDocuments()).toBe(1);
});

test("an unknown item is always refused", async () => {
  const admin = await createUser();
  const res = await sell(
    admin.token,
    body([
      line(shirt),
      { variantId: "ghost", quantity: 1, unitPricePaise: 100 },
    ]),
  );

  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe("UNKNOWN_VARIANT");
  expect(await Sale.countDocuments()).toBe(0);
  expect(await stockOf(shirt)).toBe(10);
});

test("an archived item is refused online but saved with a flag offline", async () => {
  const admin = await createUser();
  await Variant.updateOne({ _id: shirt._id }, { status: "archived" });

  const online = await sell(admin.token, body([line(shirt)]));
  expect(online.status).toBe(422);
  expect(online.body.error.code).toBe("SALE_NOT_ALLOWED");
  expect(codes(online)).toContain("ITEM_ARCHIVED");
  expect(await Sale.countDocuments()).toBe(0);

  const offline = await sell(
    admin.token,
    body([line(shirt)], { offline: true }),
  );
  expect(offline.status).toBe(201);
  expect(offline.body.sale.source).toBe("offline-sync");
  expect(offline.body.sale.flagged).toBe(true);
  expect(offline.body.sale.flags.map((f) => f.code)).toContain("ITEM_ARCHIVED");
  expect(await stockOf(shirt)).toBe(9);
});

test("the price must match the catalogue and never exceed MRP", async () => {
  const admin = await createUser();

  const lower = await sell(
    admin.token,
    body([line(shirt, 1, { unitPricePaise: 70000 })]),
  );
  expect(lower.status).toBe(422);
  expect(codes(lower)).toContain("PRICE_DIFFERS_FROM_CATALOG");

  const above = await sell(
    admin.token,
    body([line(shirt, 1, { unitPricePaise: 120000 })]),
  );
  expect(above.status).toBe(422);
  expect(codes(above)).toContain("PRICE_ABOVE_MRP");

  const offline = await sell(
    admin.token,
    body([line(shirt, 1, { unitPricePaise: 70000 })], { offline: true }),
  );
  expect(offline.status).toBe(201);
  expect(offline.body.sale.flagged).toBe(true);
  expect(offline.body.sale.subtotalPaise).toBe(70000);
  expect(offline.body.sale.flags.map((f) => f.code)).toContain(
    "PRICE_DIFFERS_FROM_CATALOG",
  );
});

test("a cashier cannot discount beyond the limit, an admin can, and an offline sale is flagged", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });

  const over = await sell(cashier.token, body([line(shirt)], percent(15)));
  expect(over.status).toBe(422);
  expect(codes(over)).toContain("DISCOUNT_OVER_LIMIT");

  const within = await sell(cashier.token, body([line(shirt)], percent(10)));
  expect(within.status).toBe(201);
  expect(within.body.sale.flagged).toBe(false);

  const byAdmin = await sell(admin.token, body([line(shirt)], percent(15)));
  expect(byAdmin.status).toBe(201);
  expect(byAdmin.body.sale.flagged).toBe(false);

  const offline = await sell(
    cashier.token,
    body([line(shirt)], { ...percent(15), offline: true }),
  );
  expect(offline.status).toBe(201);
  expect(offline.body.sale.flags.map((f) => f.code)).toContain(
    "DISCOUNT_OVER_LIMIT",
  );

  const settings = await getShopSettings();
  settings.maxCashierDiscountPercent = 20;
  await settings.save();
  const raised = await sell(cashier.token, body([line(shirt)], percent(15)));
  expect(raised.status).toBe(201);
});

test("short stock refuses an online sale, but an offline sale is saved and flagged", async () => {
  const admin = await createUser();
  await Variant.updateOne({ _id: shirt._id }, { currentStock: 1 });

  const online = await sell(admin.token, body([line(shirt, 3)]));
  expect(online.status).toBe(409);
  expect(online.body.error.code).toBe("INSUFFICIENT_STOCK");
  expect(await Sale.countDocuments()).toBe(0);
  expect(await stockOf(shirt)).toBe(1);

  const offline = await sell(
    admin.token,
    body([line(shirt, 3)], { offline: true }),
  );
  expect(offline.status).toBe(201);
  expect(await stockOf(shirt)).toBe(-2);
  expect(offline.body.sale.flags.map((f) => f.code)).toContain(
    "STOCK_SHORTFALL",
  );
});

test("an online sale may go below zero stock when the shop allows it", async () => {
  const admin = await createUser();
  await Variant.updateOne({ _id: shirt._id }, { currentStock: 1 });
  const settings = await getShopSettings();
  settings.allowNegativeStock = true;
  await settings.save();

  const res = await sell(admin.token, body([line(shirt, 3)]));

  expect(res.status).toBe(201);
  expect(res.body.sale.flagged).toBe(false);
  expect(await stockOf(shirt)).toBe(-2);
});

test("a sale that fails on its second item changes nothing, not even the invoice number", async () => {
  const admin = await createUser();

  const bad = await sell(admin.token, body([line(shirt, 1), line(jeans, 99)]));
  expect(bad.status).toBe(409);
  expect(bad.body.error.code).toBe("INSUFFICIENT_STOCK");

  expect(await Sale.countDocuments()).toBe(0);
  expect(await StockMovement.countDocuments({ type: "sale" })).toBe(0);
  expect(await stockOf(shirt)).toBe(10);
  expect(await stockOf(jeans)).toBe(5);

  const good = await sell(admin.token, body([line(shirt)]));
  expect(good.body.sale.invoiceNumber).toBe("INV-S000001");
});

test("a sale time in the future is refused and a past time is kept", async () => {
  const admin = await createUser();

  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  expect(
    (await sell(admin.token, body([line(shirt)], { soldAt: future }))).status,
  ).toBe(400);

  const past = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const saved = await sell(
    admin.token,
    body([line(shirt)], { soldAt: past, offline: true }),
  );
  expect(saved.status).toBe(201);
  expect(new Date(saved.body.sale.soldAt).toISOString()).toBe(past);
});

test("the same item listed twice is refused", async () => {
  const admin = await createUser();
  const res = await sell(admin.token, body([line(shirt, 1), line(shirt, 2)]));
  expect(res.status).toBe(400);
  expect(await Sale.countDocuments()).toBe(0);
});

test("selling and reading sales need a login", async () => {
  expect(
    (
      await request(app)
        .post("/api/sales")
        .send(body([line(shirt)]))
    ).status,
  ).toBe(401);
  expect((await request(app).get("/api/sales")).status).toBe(401);
});

test("cashiers see only their own sales, admins see everything", async () => {
  const admin = await createUser();
  const till1 = await createUser({ username: "till1", role: "cashier" });
  const till2 = await createUser({ username: "till2", role: "cashier" });
  const a = await sell(till1.token, body([line(shirt)]));
  const b = await sell(till2.token, body([line(shirt)]));
  await sell(admin.token, body([line(shirt)]));

  const mine = await getAs("/api/sales", till1.token);
  expect(mine.body.total).toBe(1);
  expect(mine.body.items[0].id).toBe(a.body.sale.id);

  expect((await getAs("/api/sales", admin.token)).body.total).toBe(3);
  expect(
    (await getAs(`/api/sales/${b.body.sale.id}`, till1.token)).status,
  ).toBe(404);

  const spoof = await getAs(
    `/api/sales?cashierId=${till2.user._id}`,
    till1.token,
  );
  expect(spoof.body.total).toBe(1);
});

test("cost prices are stored on sale items but never shown to cashiers", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });
  const created = await sell(cashier.token, body([line(shirt)]));
  const id = created.body.sale.id;

  expect(JSON.stringify(created.body)).not.toContain("costPaise");
  expect(
    JSON.stringify((await getAs(`/api/sales/${id}`, cashier.token)).body),
  ).not.toContain("costPaise");

  const asAdmin = await getAs(`/api/sales/${id}`, admin.token);
  expect(asAdmin.body.sale.items[0].costPaise).toBe(30000);
});

test("sales can be listed with invoice search, flagged and date filters", async () => {
  const admin = await createUser();
  await sell(admin.token, body([line(shirt)])); // INV-S000001
  await sell(
    admin.token,
    body([line(shirt, 1, { unitPricePaise: 70000 })], { offline: true }),
  ); // flagged
  await sell(admin.token, body([line(jeans)])); // INV-S000003

  expect((await getAs("/api/sales", admin.token)).body.total).toBe(3);
  expect((await getAs("/api/sales?flagged=true", admin.token)).body.total).toBe(
    1,
  );
  expect(
    (await getAs("/api/sales?flagged=false", admin.token)).body.total,
  ).toBe(2);
  expect(
    (await getAs("/api/sales?search=S000002", admin.token)).body.total,
  ).toBe(1);

  const later = encodeURIComponent(
    new Date(Date.now() + 3600_000).toISOString(),
  );
  expect(
    (await getAs(`/api/sales?from=${later}`, admin.token)).body.total,
  ).toBe(0);

  const page = await getAs("/api/sales?limit=2", admin.token);
  expect(page.body.items).toHaveLength(2);
  expect(page.body.items[0].items).toBeUndefined();
});

test("a sale can be found by its invoice number, within the same access rules", async () => {
  const admin = await createUser();
  const till1 = await createUser({ username: "till1", role: "cashier" });
  const till2 = await createUser({ username: "till2", role: "cashier" });
  const created = await sell(till1.token, body([line(shirt)]));
  const number = created.body.sale.invoiceNumber;

  const found = await getAs(`/api/sales/by-invoice/${number}`, admin.token);
  expect(found.status).toBe(200);
  expect(found.body.sale.id).toBe(created.body.sale.id);

  expect(
    (await getAs("/api/sales/by-invoice/INV-999999", admin.token)).status,
  ).toBe(404);
  expect(
    (await getAs(`/api/sales/by-invoice/${number}`, till2.token)).status,
  ).toBe(404);
});

test("sales are written to the audit log together with their flags", async () => {
  const admin = await createUser();
  await sell(
    admin.token,
    body([line(shirt, 1, { unitPricePaise: 70000 })], { offline: true }),
  );

  const log = await AuditLog.findOne({ action: "sale.created" }).lean();
  expect(log).toBeTruthy();
  expect(log.details.source).toBe("offline-sync");
  expect(log.details.flags).toContain("PRICE_DIFFERS_FROM_CATALOG");
});

test("a completed sale cannot be edited or deleted", async () => {
  const admin = await createUser();
  const created = await sell(admin.token, body([line(shirt)]));
  const url = `/api/sales/${created.body.sale.id}`;

  for (const method of ["patch", "put", "delete"]) {
    const res = await request(app)
      [method](url)
      .set(authHeader(admin.token))
      .send({ totalPaise: 1 });
    expect(res.status).toBe(404);
  }
  expect((await Sale.findById(created.body.sale.id)).totalPaise).toBe(79900);
});
