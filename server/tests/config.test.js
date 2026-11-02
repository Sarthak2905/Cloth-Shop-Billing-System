import { expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const valid = {
  MONGODB_URI: "mongodb://localhost:27017/clothing_pos",
  JWT_SECRET: "a".repeat(32),
};

test("loads a valid configuration and fills in defaults", () => {
  const config = loadConfig(valid);
  expect(config.port).toBe(5000);
  expect(config.jwtExpiresIn).toBe("12h");
  expect(config.clientOrigins).toEqual(["http://localhost:5173"]);
  expect(config.bcryptCost).toBe(12);
});

test("splits several allowed origins", () => {
  const config = loadConfig({
    ...valid,
    CLIENT_ORIGINS: "https://a.example, https://b.example",
  });
  expect(config.clientOrigins).toEqual([
    "https://a.example",
    "https://b.example",
  ]);
});

test("refuses to start without a database address", () => {
  expect(() => loadConfig({ JWT_SECRET: valid.JWT_SECRET })).toThrow(
    /MONGODB_URI/,
  );
});

test("refuses a token secret that is too short", () => {
  expect(() => loadConfig({ ...valid, JWT_SECRET: "short" })).toThrow(
    /at least 32/,
  );
});
