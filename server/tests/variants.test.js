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

  const bad = [
    variantBody({ costPaise: -1 }),
    variantBody({ costPaise: 10.5 }),
    variantBody({ barcode: "ab" }),
    variantBody({ barcode: "has space" }),
    variantBody({ openingStock: -2 }),
    variantBody({ currentStock: 50 }),
    variantBody({ size: "x".repeat(51) }),
    variantBody({ unit: "kg" }),
    variantBody({ packSize: 0 }),
    variantBody({ packSize: 1.5 }),
    { ...variantBody(), sellingPricePaise: undefined },
    { ...variantBody(), barcode: undefined },
  ];
  for (const body of bad) {
    expect((await addVariant(admin.token, product._id, body)).status).toBe(400);
  }
  expect(await Variant.countDocuments()).toBe(0);
});

test("refuses only a duplicate barcode, and saves nothing from a refused request", async () => {
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

  expect(await Variant.countDocuments()).toBe(1);
  expect(await StockMovement.countDocuments()).toBe(1); // only the first one's opening stock

  // The same SKU, or the same product and size, are fine: each entry has its own barcode.
  const sameSku = await addVariant(
    admin.token,
    product._id,
    variantBody({ barcode: "CLO000002", size: "L" }),
  );
  expect(sameSku.status).toBe(201);

  const sameSize = await addVariant(
    admin.token,
    product._id,
    variantBody({ sku: "OTHER-2", barcode: "CLO000003" }),
  );
  expect(sameSize.status).toBe(201);

  expect(await Variant.countDocuments()).toBe(3);
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

test("an update may put the selling price above the MRP", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id); // MRP 99900, selling 79900

  const higher = await patch(`/api/variants/${variant._id}`, admin.token, {
    sellingPricePaise: 120000,
  });
  expect(higher.status).toBe(200);
  expect((await Variant.findById(variant._id)).sellingPricePaise).toBe(120000);

  const lowerMrp = await patch(`/api/variants/${variant._id}`, admin.token, {
    mrpPaise: 50000,
  });
  expect(lowerMrp.status).toBe(200);
  expect((await Variant.findById(variant._id)).mrpPaise).toBe(50000);
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

// ---- New rules ----

test("a selling price above the MRP is allowed", async () => {
  const admin = await createUser();
  const product = await makeProduct();

  const res = await addVariant(
    admin.token,
    product._id,
    variantBody({ sellingPricePaise: 120000 }), // MRP is 99900
  );

  expect(res.status).toBe(201);
  expect(res.body.variant).toMatchObject({
    sellingPricePaise: 120000,
    mrpPaise: 99900,
  });
});

test("only the barcode and the selling price are needed: the SKU, size, cost and MRP are optional", async () => {
  const admin = await createUser();
  const product = await makeProduct();

  const res = await addVariant(admin.token, product._id, {
    barcode: "CLO000020",
    sellingPricePaise: 59900,
  });

  expect(res.status).toBe(201);
  expect(res.body.variant).toMatchObject({
    sku: "CLO000020", // the barcode, when no SKU is given
    size: "",
    unit: "piece",
    costPaise: 0,
    mrpPaise: 59900, // the selling price, when no MRP is given
    currentStock: 0,
    packSize: null,
  });
  expect(await StockMovement.countDocuments()).toBe(0);
});

test("any size text, and the same product and size and SKU many times", async () => {
  const admin = await createUser();
  const product = await makeProduct();

  const sizes = ["", "2-3 years", "Free size", "M", "M", "m"];
  for (const [index, size] of sizes.entries()) {
    const res = await addVariant(
      admin.token,
      product._id,
      variantBody({ sku: "SAME", barcode: `CLO0000${30 + index}`, size }),
    );
    expect(res.status).toBe(201);
  }

  expect(await Variant.countDocuments()).toBe(6);
});

test("fabric is saved by the meter, with its stock in centimetres", async () => {
  const admin = await createUser();
  const product = await makeProduct({ name: "Pant Piece" });

  const res = await addVariant(
    admin.token,
    product._id,
    variantBody({
      sku: "FAB-1",
      barcode: "CLO000040",
      size: "Grey 101",
      unit: "meter",
      sellingPricePaise: 45000,
      mrpPaise: 45000,
      openingStock: 2550,
      reorderThreshold: 300,
    }),
  );

  expect(res.status).toBe(201);
  expect(res.body.variant).toMatchObject({ unit: "meter", currentStock: 2550 });
  const movement = await StockMovement.findOne({
    variantId: res.body.variant.id,
  });
  expect(movement).toMatchObject({ type: "opening", quantityChange: 2550 });

  const fetched = await get(
    `/api/variants/${res.body.variant.id}`,
    admin.token,
  );
  expect(fetched.body.variant.unit).toBe("meter");
});

test("a box size is kept and can be changed, but not set to zero", async () => {
  const admin = await createUser();
  const product = await makeProduct();

  const created = await addVariant(
    admin.token,
    product._id,
    variantBody({
      barcode: "CLO000050",
      sku: "BOX-1",
      packSize: 10,
      openingStock: 40,
    }),
  );
  expect(created.status).toBe(201);
  expect(created.body.variant).toMatchObject({
    packSize: 10,
    currentStock: 40,
  });

  const id = created.body.variant.id;
  const changed = await patch(`/api/variants/${id}`, admin.token, {
    packSize: 12,
  });
  expect(changed.status).toBe(200);
  expect(changed.body.variant.packSize).toBe(12);

  expect(
    (await patch(`/api/variants/${id}`, admin.token, { packSize: 0 })).status,
  ).toBe(400);
});

test("the unit (piece or meter) cannot be changed by an update", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id);

  const res = await patch(`/api/variants/${variant._id}`, admin.token, {
    unit: "meter",
  });

  expect(res.status).toBe(400);
  expect((await Variant.findById(variant._id)).unit).toBe("piece");
});
