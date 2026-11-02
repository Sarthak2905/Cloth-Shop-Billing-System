import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Product } from "../src/models/Product.js";
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
import { makeProduct, makeVariant, variantBody } from "./helpers/catalog.js";

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
const addVariant = (token, productId, body = variantBody()) =>
  post(`/api/products/${productId}/variants`, token, body);

test("creates a variant with opening stock and an opening movement", async () => {
  const admin = await createUser();
  const product = await makeProduct();

  const res = await addVariant(admin.token, product._id);

  expect(res.status).toBe(201);
  expect(res.body.variant).toMatchObject({
    productId: product._id,
    sku: "SHIRT-M",
    barcode: "CLO000001",
    size: "M",
    currentStock: 10,
    costPaise: 30000,
    status: "active",
  });

  const movements = await StockMovement.find({
    variantId: res.body.variant.id,
  });
  expect(movements).toHaveLength(1);
  expect(movements[0]).toMatchObject({
    type: "opening",
    quantityChange: 10,
    stockAfter: 10,
  });
});

test("a cashier cannot create or edit variants", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });
  const product = await makeProduct();
  const variant = await makeVariant(product._id);

  expect((await addVariant(cashier.token, product._id)).status).toBe(403);
  expect(
    (
      await patch(`/api/variants/${variant._id}`, cashier.token, {
        sellingPricePaise: 1,
      })
    ).status,
  ).toBe(403);
});

test("rejects bad variant input", async () => {
  const admin = await createUser();
  const product = await makeProduct();

  const overMrp = await addVariant(
    admin.token,
    product._id,
    variantBody({ sellingPricePaise: 120000 }),
  );
  expect(overMrp.status).toBe(400);
  expect(overMrp.body.error.details[0].field).toBe("sellingPricePaise");

  const bad = [
    variantBody({ costPaise: -1 }),
    variantBody({ costPaise: 10.5 }),
    variantBody({ barcode: "ab" }),
    variantBody({ barcode: "has space" }),
    variantBody({ openingStock: -2 }),
    variantBody({ currentStock: 50 }),
    { ...variantBody(), sku: undefined },
  ];
  for (const body of bad) {
    expect((await addVariant(admin.token, product._id, body)).status).toBe(400);
  }
  expect(await Variant.countDocuments()).toBe(0);
});

test("refuses a duplicate barcode, SKU or size, and saves nothing from a refused request", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  expect((await addVariant(admin.token, product._id)).status).toBe(201);

  const barcode = await addVariant(
    admin.token,
    product._id,
    variantBody({ sku: "OTHER-1", size: "L" }),
  );
  expect(barcode.status).toBe(409);
  expect(barcode.body.error.code).toBe("DUPLICATE_BARCODE");

  const sku = await addVariant(
    admin.token,
    product._id,
    variantBody({ barcode: "CLO000002", size: "L" }),
  );
  expect(sku.status).toBe(409);
  expect(sku.body.error.code).toBe("DUPLICATE_SKU");

  const size = await addVariant(
    admin.token,
    product._id,
    variantBody({ sku: "OTHER-2", barcode: "CLO000003" }),
  );
  expect(size.status).toBe(409);
  expect(size.body.error.code).toBe("DUPLICATE_VARIANT");

  expect(await Variant.countDocuments()).toBe(1);
  expect(await StockMovement.countDocuments()).toBe(1); // only the first one's opening stock
});

test("the same size can exist under a different product", async () => {
  const admin = await createUser();
  const shirt = await makeProduct({ name: "Cotton Shirt" });
  const jeans = await makeProduct({ name: "Denim Jeans" });

  expect((await addVariant(admin.token, shirt._id)).status).toBe(201);
  const second = await addVariant(
    admin.token,
    jeans._id,
    variantBody({ sku: "JEANS-M", barcode: "CLO000002" }),
  );
  expect(second.status).toBe(201);
});

test("cannot add a variant to a missing or archived product", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  await Product.updateOne({ _id: product._id }, { status: "archived" });

  const archived = await addVariant(admin.token, product._id);
  expect(archived.status).toBe(409);
  expect(archived.body.error.code).toBe("PRODUCT_ARCHIVED");

  expect((await addVariant(admin.token, "missing")).status).toBe(404);
});

test("finds a variant by barcode and says whether it can be sold", async () => {
  const admin = await createUser();
  const product = await makeProduct({ name: "Cotton Shirt" });
  const variant = await makeVariant(product._id, { barcode: "CLO000001" });

  const found = await get("/api/variants/barcode/CLO000001", admin.token);
  expect(found.status).toBe(200);
  expect(found.body.variant.id).toBe(variant._id);
  expect(found.body.product.name).toBe("Cotton Shirt");
  expect(found.body.sellable).toBe(true);

  expect(
    (await get("/api/variants/barcode/CLO999999", admin.token)).status,
  ).toBe(404);
  expect(
    (
      await get(
        `/api/variants/barcode/${encodeURIComponent("bad barcode!")}`,
        admin.token,
      )
    ).status,
  ).toBe(400);

  await Variant.updateOne({ _id: variant._id }, { status: "archived" });
  const archived = await get("/api/variants/barcode/CLO000001", admin.token);
  expect(archived.status).toBe(200);
  expect(archived.body.sellable).toBe(false);
});

test("cashiers see no cost prices anywhere, admins do", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });
  const product = await makeProduct();
  const variant = await makeVariant(product._id, {
    barcode: "CLO000001",
    costPaise: 31000,
  });

  const urls = [
    `/api/variants?productId=${product._id}`,
    "/api/variants/barcode/CLO000001",
    `/api/variants/${variant._id}`,
  ];
  for (const url of urls) {
    const asCashier = await get(url, cashier.token);
    expect(asCashier.status).toBe(200);
    expect(JSON.stringify(asCashier.body)).not.toContain("costPaise");

    const asAdmin = await get(url, admin.token);
    expect(JSON.stringify(asAdmin.body)).toContain('"costPaise":31000');
  }
});

test("an update changes prices and the audit log keeps the old and new values", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id);

  const res = await patch(`/api/variants/${variant._id}`, admin.token, {
    sellingPricePaise: 70000,
  });
  expect(res.status).toBe(200);
  expect(res.body.variant.sellingPricePaise).toBe(70000);

  const log = await AuditLog.findOne({ action: "variant.updated" }).lean();
  expect(log.details.changes.sellingPricePaise).toEqual({
    from: 79900,
    to: 70000,
  });
});

test("an update cannot push the selling price above the MRP", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id); // MRP 99900, selling 79900

  expect(
    (
      await patch(`/api/variants/${variant._id}`, admin.token, {
        sellingPricePaise: 120000,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await patch(`/api/variants/${variant._id}`, admin.token, {
        mrpPaise: 50000,
      })
    ).status,
  ).toBe(400);
  expect((await Variant.findById(variant._id)).mrpPaise).toBe(99900);
});

test("stock cannot be changed through a variant update", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id, { currentStock: 10 });

  const res = await patch(`/api/variants/${variant._id}`, admin.token, {
    currentStock: 999,
  });
  expect(res.status).toBe(400);
  expect((await Variant.findById(variant._id)).currentStock).toBe(10);
});

test("changing a barcode to one that is taken gives a clear conflict", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  await makeVariant(product._id, { size: "M", barcode: "CLO000001" });
  const second = await makeVariant(product._id, {
    size: "L",
    barcode: "CLO000002",
  });

  const res = await patch(`/api/variants/${second._id}`, admin.token, {
    barcode: "CLO000001",
  });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("DUPLICATE_BARCODE");
});

test("lists variants with search, product, low-stock filters and pagination", async () => {
  const admin = await createUser();
  const shirt = await makeProduct({ name: "Cotton Shirt" });
  const jeans = await makeProduct({ name: "Denim Jeans" });
  await makeVariant(shirt._id, {
    sku: "SHIRT-M",
    barcode: "CLO000001",
    size: "M",
    currentStock: 10,
  });
  await makeVariant(shirt._id, {
    sku: "SHIRT-L",
    barcode: "CLO000002",
    size: "L",
    currentStock: 2,
  });
  await makeVariant(jeans._id, {
    sku: "JEANS-32",
    barcode: "CLO000003",
    size: "32",
    currentStock: 8,
  });

  const all = await get("/api/variants", admin.token);
  expect(all.body.total).toBe(3);
  expect(all.body.items[0].productName).toEqual(expect.any(String));

  expect(
    (await get("/api/variants?search=jeans", admin.token)).body.total,
  ).toBe(1);
  expect(
    (await get("/api/variants?search=shirt-m", admin.token)).body.total,
  ).toBe(1);
  expect(
    (await get("/api/variants?search=CLO000002", admin.token)).body.total,
  ).toBe(1);
  expect(
    (await get(`/api/variants?productId=${shirt._id}`, admin.token)).body.total,
  ).toBe(2);

  const low = await get("/api/variants?lowStock=true", admin.token);
  expect(low.body.items.map((v) => v.sku)).toEqual(["SHIRT-L"]);

  const page = await get("/api/variants?limit=1&page=3", admin.token);
  expect(page.body.items).toHaveLength(1);
  expect(page.body.total).toBe(3);
});

test("fetching a variant by id works, and an unknown id gives 404", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id);

  expect(
    (await get(`/api/variants/${variant._id}`, admin.token)).body.variant.id,
  ).toBe(variant._id);
  expect((await get("/api/variants/missing", admin.token)).status).toBe(404);
});

