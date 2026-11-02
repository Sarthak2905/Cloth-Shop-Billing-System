import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  CLIENT_ORIGINS: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
});

// Reads and checks the environment once, at startup. Secrets are never printed.
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid server configuration:\n${problems}`);
  }

  const e = result.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    mongoUri: e.MONGODB_URI,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    clientOrigins: e.CLIENT_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: e.TRUST_PROXY,
    bcryptCost: e.BCRYPT_COST,
    loginRateLimit: { windowMs: 15 * 60 * 1000, limit: 20 },
    apiRateLimit: { windowMs: 60 * 1000, limit: 300 },
    lockout: { maxFailures: 5, minutes: 15 },
  };
}
