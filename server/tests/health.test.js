import request from "supertest";
import { test, expect } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp({
  trustProxy: false,
  clientOrigins: ["http://localhost:5173"],

  apiRateLimit: {
    windowMs: 15 * 60 * 1000,
    limit: 100,
  },

  loginRateLimit: {
    windowMs: 15 * 60 * 1000,
    limit: 5,
  },

  bcryptCost: 12,

  jwtSecret: "a".repeat(32),
  jwtExpiresIn: "12h",

  lockout: {
    maxFailures: 5,
    minutes: 15,
  },
});

test("GET /api/health returns ok", async () => {
  const res = await request(app).get("/api/health");

  expect(res.status).toBe(200);
  expect(res.body.status).toBe("ok");
});
