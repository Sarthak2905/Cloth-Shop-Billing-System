import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Settings } from "../src/models/Settings.js";
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

const patch = (token, body) =>
  request(app).patch("/api/settings").set(authHeader(token)).send(body);

test("settings need a login", async () => {
  expect((await request(app).get("/api/settings")).status).toBe(401);
});

test("returns the defaults, including to a cashier", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });
  const res = await request(app)
    .get("/api/settings")
    .set(authHeader(cashier.token));

  expect(res.status).toBe(200);
  expect(res.body.settings).toMatchObject({
    shopName: "My Clothing Store",
    invoicePrefix: "INV",
    receiptPaperWidth: "58",
    roundToRupee: true,
    allowNegativeStock: false,
    maxCashierDiscountPercent: 10,
  });
});

test("an admin can update settings and they are saved", async () => {
  const admin = await createUser();
  const res = await patch(admin.token, {
    shopName: "Sarthak Fashions",
    roundToRupee: false,
    maxCashierDiscountPercent: 15,
  });

  expect(res.status).toBe(200);
  expect(res.body.settings).toMatchObject({
    shopName: "Sarthak Fashions",
    roundToRupee: false,
    maxCashierDiscountPercent: 15,
  });

  const again = await request(app)
    .get("/api/settings")
    .set(authHeader(admin.token));
  expect(again.body.settings.shopName).toBe("Sarthak Fashions");
  expect((await Settings.findById("shop")).roundToRupee).toBe(false);
});

test("a cashier cannot change settings", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });
  expect((await patch(cashier.token, { shopName: "Hacked" })).status).toBe(403);
});

test("rejects invalid values and unknown fields", async () => {
  const admin = await createUser();
  expect(
    (await patch(admin.token, { invoicePrefix: "bad prefix" })).status,
  ).toBe(400);
  expect((await patch(admin.token, { receiptPaperWidth: "70" })).status).toBe(
    400,
  );
  expect(
    (await patch(admin.token, { maxCashierDiscountPercent: 150 })).status,
  ).toBe(400);
  expect((await patch(admin.token, { somethingElse: true })).status).toBe(400);
});

test("an empty update is rejected", async () => {
  const admin = await createUser();
  expect((await patch(admin.token, {})).status).toBe(400);
});

test("settings changes are written to the audit log", async () => {
  const admin = await createUser();
  await patch(admin.token, { shopName: "Sarthak Fashions" });

  const log = await AuditLog.findOne({ action: "settings.updated" }).lean();
  expect(log).toBeTruthy();
  expect(log.details.changes.shopName).toBe("Sarthak Fashions");
  expect(log.username).toBe("owner");
});
