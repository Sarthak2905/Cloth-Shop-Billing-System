import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { hashPassword } from "../../src/auth/passwords.js";
import { signToken } from "../../src/auth/tokens.js";
import { initModels } from "../../src/models/index.js";
import { User } from "../../src/models/User.js";

export function testConfig(over = {}) {
  return {
    env: "test",
    port: 0,
    mongoUri: "",
    jwtSecret: "test-secret-for-signing-tokens-0123456789-abcdef",
    jwtExpiresIn: "1h",
    clientOrigins: ["http://localhost:5173"],
    trustProxy: 0,
    bcryptCost: 4, // fast hashing for tests only
    loginRateLimit: { windowMs: 60_000, limit: 1000 },
    apiRateLimit: { windowMs: 60_000, limit: 10_000 },
    lockout: { maxFailures: 5, minutes: 15 },
    ...over,
  };
}

let replSet = null;

// A throwaway MongoDB (as a replica set, so transactions work). The first run
// downloads it, which can take a few minutes.
export async function startTestDatabase() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { dbName: "test" });
  await initModels();
}

export async function stopTestDatabase() {
  await mongoose.disconnect();
  await replSet?.stop();
  replSet = null;
}

export async function clearDatabase() {
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.deleteMany({})),
  );
}

export async function createUser({
  username = "owner",
  role = "admin",
  password = "correct-horse-battery",
  active = true,
  displayName,
} = {}) {
  const config = testConfig();
  const user = await User.create({
    username,
    displayName: displayName ?? username,
    role,
    active,
    passwordHash: await hashPassword(password, config.bcryptCost),
  });
  return { user, password, token: signToken(user, config) };
}

export const authHeader = (token) => ({ Authorization: `Bearer ${token}` });
