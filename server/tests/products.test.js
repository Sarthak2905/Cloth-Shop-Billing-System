import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Product } from "../src/models/Product.js";
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

const get = (path, token) => request(app).get(path).set(authHeader(token));
const post = (path, token, body = {}) =>
  request(app).post(path).set(authHeader(token)).send(body);
const patch = (path, token, body) =>
  request(app).patch(path).set(authHeader(token)).send(body);

test("listing products needs a login, and any logged-in user can do it", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });

  expect((await request(app).get("/api/products")).status).toBe(401);

  const res = await get("/api/products", cashier.token);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ items: [], page: 1, limit: 50, total: 0 });
});

test("an admin creates a product, optionally with the id the app already made", async () => {
  const admin = await createUser();
  const id = randomUUID();

  const created = await post("/api/products", admin.token, {
    id,
    name: "Cotton Shirt",
    category: "Shirts",
    brand: "UrbanFit",
  });
  expect(created.status).toBe(201);
  expect(created.body.product).toMatchObject({
    id,
    name: "Cotton Shirt",
    brand: "UrbanFit",
    supplier: "",
    status: "active",
  });

  const again = await post("/api/products", admin.token, {
    id,
    name: "Other",
    category: "Other",
  });
  expect(again.status).toBe(409);
  expect(again.body.error.code).toBe("ID_EXISTS");

  const noId = await post("/api/products", admin.token, {
    name: "Denim Jeans",
    category: "Jeans",
  });
  expect(noId.status).toBe(201);
  expect(noId.body.product.id).toEqual(expect.any(String));
});

test("a cashier cannot create, change or archive products", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });
  const product = await makeProduct();

  expect(
    (await post("/api/products", cashier.token, { name: "X", category: "Y" }))
      .status,
  ).toBe(403);
  expect(
    (await patch(`/api/products/${product._id}`, cashier.token, { name: "Z" }))
      .status,
  ).toBe(403);
  expect(
    (await post(`/api/products/${product._id}/archive`, cashier.token)).status,
  ).toBe(403);
});

test("rejects bad product input", async () => {
  const admin = await createUser();
  expect(
    (
      await post("/api/products", admin.token, {
        name: "  ",
        category: "Shirts",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post("/api/products", admin.token, {
        name: "A",
        category: "B",
        price: 5,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await post("/api/products", admin.token, {
        id: "not-a-uuid",
        name: "A",
        category: "B",
      })
    ).status,
  ).toBe(400);
});

test("lists products with search, status filter and pagination", async () => {
  const admin = await createUser();
  for (const [name, category] of [
    ["Alpha Shirt", "Shirts"],
    ["Beta Jeans", "Jeans"],
    ["Gamma Shirt", "Shirts"],
    ["Delta Tee", "Tees"],
    ["Echo Shirt", "Shirts"],
  ]) {
    await makeProduct({ name, category });
  }

  const shirts = await get("/api/products?search=shirt", admin.token);
  expect(shirts.body.total).toBe(3);

  const page2 = await get("/api/products?limit=2&page=2", admin.token);
  expect(page2.body.items.map((p) => p.name)).toEqual([
    "Delta Tee",
    "Echo Shirt",
  ]);
  expect(page2.body.total).toBe(5);

  await Product.updateOne({ name: "Beta Jeans" }, { status: "archived" });
  expect((await get("/api/products", admin.token)).body.total).toBe(4);
  expect(
    (await get("/api/products?status=archived", admin.token)).body.total,
  ).toBe(1);
  expect((await get("/api/products?status=all", admin.token)).body.total).toBe(
    5,
  );
});

test("search text is matched literally, never as a pattern", async () => {
  const admin = await createUser();
  await makeProduct({ name: "Shirt (Blue)" });

  const brackets = await get(
    `/api/products?search=${encodeURIComponent("(")}`,
    admin.token,
  );
  expect(brackets.status).toBe(200);
  expect(brackets.body.total).toBe(1);

  const wildcard = await get(
    `/api/products?search=${encodeURIComponent(".*")}`,
    admin.token,
  );
  expect(wildcard.status).toBe(200);
  expect(wildcard.body.total).toBe(0);
});

test("an admin can update a product", async () => {
  const admin = await createUser();
  const product = await makeProduct();

  const res = await patch(`/api/products/${product._id}`, admin.token, {
    name: "Linen Shirt",
  });
  expect(res.status).toBe(200);
  expect(res.body.product.name).toBe("Linen Shirt");
  expect(res.body.product.category).toBe("Shirts");

  expect(
    (await patch(`/api/products/${product._id}`, admin.token, {})).status,
  ).toBe(400);
  expect(
    (
      await patch(`/api/products/${product._id}`, admin.token, {
        status: "archived",
      })
    ).status,
  ).toBe(400);
});

test("archiving a product archives its variants and hides it from the default list", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  await makeVariant(product._id, { size: "M" });
  await makeVariant(product._id, { size: "L" });

  const res = await post(`/api/products/${product._id}/archive`, admin.token);
  expect(res.status).toBe(200);
  expect(res.body.product.status).toBe("archived");

  const variants = await Variant.find({ productId: product._id });
  expect(variants.every((v) => v.status === "archived")).toBe(true);

  expect((await get("/api/products", admin.token)).body.total).toBe(0);
  const detail = await get(`/api/products/${product._id}`, admin.token);
  expect(detail.status).toBe(200);
  expect(detail.body.product.status).toBe("archived");
});

test("product detail lists its variants, and cashiers never see cost prices", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });
  const product = await makeProduct();
  await makeVariant(product._id, { size: "M", costPaise: 31000 });

  const asAdmin = await get(`/api/products/${product._id}`, admin.token);
  expect(asAdmin.body.variants).toHaveLength(1);
  expect(asAdmin.body.variants[0].costPaise).toBe(31000);

  const asCashier = await get(`/api/products/${product._id}`, cashier.token);
  expect(asCashier.body.variants).toHaveLength(1);
  expect(asCashier.body.variants[0].costPaise).toBeUndefined();
  expect(JSON.stringify(asCashier.body)).not.toContain("costPaise");
});

test("an unknown product gives 404", async () => {
  const admin = await createUser();
  expect((await get("/api/products/missing", admin.token)).status).toBe(404);
  expect(
    (await patch("/api/products/missing", admin.token, { name: "X" })).status,
  ).toBe(404);
  expect(
    (await post("/api/products/missing/archive", admin.token)).status,
  ).toBe(404);
});

test("product changes are written to the audit log", async () => {
  const admin = await createUser();
  const created = await post("/api/products", admin.token, {
    name: "Cotton Shirt",
    category: "Shirts",
  });
  const id = created.body.product.id;
  await patch(`/api/products/${id}`, admin.token, { name: "Linen Shirt" });
  await post(`/api/products/${id}/archive`, admin.token);

  const actions = (await AuditLog.find({ entity: "product" }).lean()).map(
    (entry) => entry.action,
  );
  expect(actions.sort()).toEqual([
    "product.archived",
    "product.created",
    "product.updated",
  ]);
});
