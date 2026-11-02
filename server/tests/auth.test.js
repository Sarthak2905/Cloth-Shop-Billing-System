import jwt from "jsonwebtoken";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { createApp } from "../src/app.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { User } from "../src/models/User.js";
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
afterEach(() => {
  vi.restoreAllMocks();
});

const login = (username, password, target = app) =>
  request(target).post("/api/auth/login").send({ username, password });

test("logs in with the right password and returns a token and a safe user", async () => {
  const { password } = await createUser({ username: "owner", role: "admin" });
  const res = await login("owner", password);

  expect(res.status).toBe(200);
  expect(res.body.token).toEqual(expect.any(String));
  expect(res.body.user).toMatchObject({
    username: "owner",
    role: "admin",
    active: true,
  });
  expect(JSON.stringify(res.body)).not.toContain("passwordHash");
});

test("usernames are not case sensitive", async () => {
  const { password } = await createUser({ username: "owner" });
  expect((await login("OWNER", password)).status).toBe(200);
});

test("a wrong password and an unknown user get the same message", async () => {
  await createUser({ username: "owner" });
  const wrong = await login("owner", "not-the-password");
  const unknown = await login("ghost", "not-the-password");

  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrong.body.error.message).toBe(unknown.body.error.message);
});

test("a disabled account cannot log in", async () => {
  const { password } = await createUser({ username: "owner", active: false });
  expect((await login("owner", password)).status).toBe(401);
});

test("rejects a login with missing fields", async () => {
  const res = await request(app).post("/api/auth/login").send({});
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("VALIDATION_ERROR");
  expect(res.body.error.details.length).toBeGreaterThan(0);
});

test("locks the account after 5 wrong passwords, even for the right password afterwards", async () => {
  const { password } = await createUser({ username: "owner" });
  for (let i = 0; i < 5; i += 1) {
    expect((await login("owner", "wrong-password-1")).status).toBe(401);
  }

  const locked = await login("owner", password);
  expect(locked.status).toBe(429);
  expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
});

test("a successful login resets the count of failed attempts", async () => {
  const { password } = await createUser({ username: "owner" });
  for (let i = 0; i < 3; i += 1) await login("owner", "wrong-password-1");
  expect((await login("owner", password)).status).toBe(200);

  for (let i = 0; i < 3; i += 1) await login("owner", "wrong-password-1");
  expect((await login("owner", password)).status).toBe(200);
});

test("limits login attempts per address", async () => {
  const limited = createApp(
    testConfig({ loginRateLimit: { windowMs: 60_000, limit: 3 } }),
  );
  for (let i = 0; i < 3; i += 1) {
    expect((await login("ghost", "whatever-password", limited)).status).toBe(
      401,
    );
  }

  const blocked = await login("ghost", "whatever-password", limited);
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
});

test("/me needs a valid token", async () => {
  const { token } = await createUser();

  expect((await request(app).get("/api/auth/me")).status).toBe(401);
  expect(
    (await request(app).get("/api/auth/me").set(authHeader("not-a-real-token")))
      .status,
  ).toBe(401);

  const ok = await request(app).get("/api/auth/me").set(authHeader(token));
  expect(ok.status).toBe(200);
  expect(ok.body.user.username).toBe("owner");
});

test("an expired token is refused", async () => {
  const { user } = await createUser();
  const expired = jwt.sign({ role: "admin", tv: 0 }, testConfig().jwtSecret, {
    subject: user._id,
    expiresIn: -10,
  });
  expect(
    (await request(app).get("/api/auth/me").set(authHeader(expired))).status,
  ).toBe(401);
});

test("a token signed with a different secret is refused", async () => {
  const { user } = await createUser();
  const forged = jwt.sign(
    { role: "admin", tv: 0 },
    "some-other-secret-that-is-long-enough-123",
    {
      subject: user._id,
    },
  );
  expect(
    (await request(app).get("/api/auth/me").set(authHeader(forged))).status,
  ).toBe(401);
});

test("changing the password logs out old sessions and the new password works", async () => {
  const { token, password } = await createUser({ username: "owner" });
  const change = (body) =>
    request(app)
      .post("/api/auth/change-password")
      .set(authHeader(token))
      .send(body);

  const wrongCurrent = await change({
    currentPassword: "wrong-wrong-1",
    newPassword: "a-new-strong-password",
  });
  expect(wrongCurrent.status).toBe(400);
  expect(wrongCurrent.body.error.code).toBe("WRONG_PASSWORD");

  expect(
    (await change({ currentPassword: password, newPassword: "short" })).status,
  ).toBe(400);
  expect(
    (await change({ currentPassword: password, newPassword: password })).status,
  ).toBe(400);

  const ok = await change({
    currentPassword: password,
    newPassword: "a-new-strong-password",
  });
  expect(ok.status).toBe(200);

  expect(
    (await request(app).get("/api/auth/me").set(authHeader(token))).status,
  ).toBe(401);
  expect(
    (await request(app).get("/api/auth/me").set(authHeader(ok.body.token)))
      .status,
  ).toBe(200);
  expect((await login("owner", "a-new-strong-password")).status).toBe(200);
  expect((await login("owner", password)).status).toBe(401);
});

test("there is no public sign-up", async () => {
  expect(
    (
      await request(app)
        .post("/api/auth/register")
        .send({ username: "x", password: "y" })
    ).status,
  ).toBe(404);
  const anonymous = await request(app)
    .post("/api/users")
    .send({
      username: "sneaky",
      displayName: "S",
      password: "long-enough-password",
      role: "admin",
    });
  expect(anonymous.status).toBe(401);
});

test("logins are written to the audit log without storing any password", async () => {
  const { password } = await createUser({ username: "owner" });
  await login("owner", "wrong-password-1");
  await login("owner", password);

  const logs = await AuditLog.find().lean();
  const actions = logs.map((entry) => entry.action);
  expect(actions).toContain("login.failed");
  expect(actions).toContain("login.succeeded");

  const text = JSON.stringify(logs);
  expect(text).not.toContain(password);
  expect(text).not.toContain("wrong-password-1");
});

test("internal errors are hidden from the client", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(User, "findOne").mockImplementation(() => {
    throw new Error("db exploded");
  });

  const res = await login("owner", "anything-at-all");

  expect(res.status).toBe(500);
  expect(res.body.error.code).toBe("INTERNAL_ERROR");
  expect(JSON.stringify(res.body)).not.toContain("db exploded");
});
