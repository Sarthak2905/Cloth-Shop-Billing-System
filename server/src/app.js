import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./http/errorHandler.js";
import { createLimiter } from "./http/rateLimiter.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { productsRouter } from "./routes/products.js";
import { salesRouter } from "./routes/sales.js";
import { settingsRouter } from "./routes/settings.js";
import { usersRouter } from "./routes/users.js";
import { variantsRouter } from "./routes/variants.js";

// Builds the Express app from a config object. It does not start a server or
// connect to a database, so tests can create as many as they like.
export function createApp(config) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  // Every request gets an id, returned in a header and in error bodies, so a
  // problem report can be matched to the server log.
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.setHeader("x-request-id", req.id);
    next();
  });

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || config.clientOrigins.includes(origin)),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createLimiter(config.apiRateLimit));

  app.use("/api/health", healthRouter());
  app.use("/api/auth", authRouter(config));
  app.use("/api/users", usersRouter(config));
  app.use("/api/settings", settingsRouter(config));
  app.use("/api/products", productsRouter(config));
  app.use("/api/variants", variantsRouter(config));
  app.use("/api/sales", salesRouter(config));

  app.use(notFoundHandler);
  app.use(errorHandler(console));

  return app;
}
