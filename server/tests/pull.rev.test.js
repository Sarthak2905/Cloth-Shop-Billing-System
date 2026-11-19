import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
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

test("a downloaded bill carries the version of its payment", async () => {
  const admin = await createUser();
  const product = await makeProduct();
  const variant = await makeVariant(product._id);
  const saleId = randomUUID();
  const created = await request(app)
    .post("/api/sales")
    .set(authHeader(admin.token))
    .send({
      id: saleId,
      lines: [
        {
          variantId: variant._id,
          quantity: 1,
          unitPricePaise: variant.sellingPricePaise,
        },
      ],
      payments: [{ method: "cash", amountPaise: variant.sellingPricePaise }],
    });
  expect(created.status).toBe(201);

  const pay = await request(app)
    .post("/api/sync/push")
    .set(authHeader(admin.token))
    .send({
      ops: [
        {
          type: "sale.payment",
          data: {
            saleId,
            payments: [
              { method: "upi", amountPaise: variant.sellingPricePaise },
            ],
            rev: 3,
          },
        },
      ],
    });
  expect(pay.body.results[0].status).toBe("applied");

  const res = await request(app)
    .get("/api/sync/pull/sales")
    .set(authHeader(admin.token));

  expect(res.body.items[0]).toMatchObject({ id: saleId, paymentRev: 3 });
});
