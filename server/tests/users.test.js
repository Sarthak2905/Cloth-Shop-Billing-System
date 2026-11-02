import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
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

const login = (username, password) =>
  request(app).post("/api/auth/login").send({ username, password });

const newCashier = {
  username: "Asha",
  displayName: "Asha",
  password: "asha-password-1",
  role: "cashier",
};

const createViaApi = (token, body = newCashier) =>
  request(app).post("/api/users").set(authHeader(token)).send(body);

test("only an admin can list users", async () => {
  const admin = await createUser({ username: "owner", role: "admin" });
  const cashier = await createUser({ username: "till1", role: "cashier" });

  expect((await request(app).get("/api/users")).status).toBe(401);
  expect(
    (await request(app).get("/api/users").set(authHeader(cashier.token)))
      .status,
  ).toBe(403);

  const ok = await request(app).get("/api/users").set(authHeader(admin.token));
  expect(ok.status).toBe(200);
  expect(ok.body.users).toHaveLength(2);
  expect(JSON.stringify(ok.body)).not.toContain("passwordHash");
});

test("an admin creates a cashier who can then log in", async () => {
  const admin = await createUser();
  const res = await createViaApi(admin.token);

  expect(res.status).toBe(201);
  expect(res.body.user).toMatchObject({
    username: "asha",
    role: "cashier",
    active: true,
  });
  expect((await login("asha", "asha-password-1")).status).toBe(200);
});

test("a cashier cannot create users", async () => {
  const cashier = await createUser({ username: "till1", role: "cashier" });
  expect((await createViaApi(cashier.token)).status).toBe(403);
});

test("rejects duplicate usernames, weak passwords, bad roles and extra fields", async () => {
  const admin = await createUser();
  expect((await createViaApi(admin.token)).status).toBe(201);

  const duplicate = await createViaApi(admin.token);
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error.code).toBe("USERNAME_TAKEN");

  expect(
    (
      await createViaApi(admin.token, {
        ...newCashier,
        username: "b1",
        password: "short",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await createViaApi(admin.token, {
        ...newCashier,
        username: "b2",
        role: "owner",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await createViaApi(admin.token, {
        ...newCashier,
        username: "b3",
        isAdmin: true,
      })
    ).status,
  ).toBe(400);
});

test("disabling a user logs them out immediately", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });
  expect(
    (await request(app).get("/api/auth/me").set(authHeader(cashier.token)))
      .status,
  ).toBe(200);

  const res = await request(app)
    .patch(`/api/users/${cashier.user._id}`)
    .set(authHeader(admin.token))
    .send({ active: false });
  expect(res.status).toBe(200);
  expect(res.body.user.active).toBe(false);

  expect(
    (await request(app).get("/api/auth/me").set(authHeader(cashier.token)))
      .status,
  ).toBe(401);
  expect((await login("till1", cashier.password)).status).toBe(401);
});

test("an admin cannot disable or demote their own account", async () => {
  const admin = await createUser();
  const patchSelf = (body) =>
    request(app)
      .patch(`/api/users/${admin.user._id}`)
      .set(authHeader(admin.token))
      .send(body);

  const disable = await patchSelf({ active: false });
  expect(disable.status).toBe(400);
  expect(disable.body.error.code).toBe("CANNOT_MODIFY_SELF");
  expect((await patchSelf({ role: "cashier" })).status).toBe(400);
});

test("resetting a password logs the user out and the new password works", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });

  const res = await request(app)
    .patch(`/api/users/${cashier.user._id}`)
    .set(authHeader(admin.token))
    .send({ password: "brand-new-password-9" });
  expect(res.status).toBe(200);

  expect(
    (await request(app).get("/api/auth/me").set(authHeader(cashier.token)))
      .status,
  ).toBe(401);
  expect((await login("till1", cashier.password)).status).toBe(401);
  expect((await login("till1", "brand-new-password-9")).status).toBe(200);
});

test("changing a role invalidates the old token", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });

  await request(app)
    .patch(`/api/users/${cashier.user._id}`)
    .set(authHeader(admin.token))
    .send({ role: "admin" });

  expect(
    (await request(app).get("/api/auth/me").set(authHeader(cashier.token)))
      .status,
  ).toBe(401);
  const again = await login("till1", cashier.password);
  expect(again.body.user.role).toBe("admin");
});

test("a password reset also unlocks a locked account", async () => {
  const admin = await createUser();
  const cashier = await createUser({ username: "till1", role: "cashier" });
  for (let i = 0; i < 5; i += 1) await login("till1", "wrong-password-1");
  expect((await login("till1", cashier.password)).status).toBe(429);

  await request(app)
    .patch(`/api/users/${cashier.user._id}`)
    .set(authHeader(admin.token))
    .send({ password: "brand-new-password-9" });

  expect((await login("till1", "brand-new-password-9")).status).toBe(200);
});

test("updating a user that does not exist gives 404", async () => {
  const admin = await createUser();
  const res = await request(app)
    .patch("/api/users/does-not-exist")
    .set(authHeader(admin.token))
    .send({ displayName: "Nobody" });
  expect(res.status).toBe(404);
});

test("user changes are written to the audit log without passwords", async () => {
  const admin = await createUser();
  const created = await createViaApi(admin.token);
  await request(app)
    .patch(`/api/users/${created.body.user.id}`)
    .set(authHeader(admin.token))
    .send({ active: false });

  const logs = await AuditLog.find({
    action: { $in: ["user.created", "user.updated"] },
  }).lean();
  expect(logs.map((entry) => entry.action).sort()).toEqual([
    "user.created",
    "user.updated",
  ]);
  expect(
    logs.find((entry) => entry.action === "user.updated").details.changed,
  ).toContain("active");
  expect(JSON.stringify(logs)).not.toContain("asha-password-1");
});
