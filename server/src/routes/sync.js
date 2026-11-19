import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { pushEnvelopeSchema } from "../domain/syncSchemas.js";
import { AppError, notFound } from "../errors.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { parse } from "../http/validate.js";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { StockMovement } from "../models/StockMovement.js";
import { Variant } from "../models/Variant.js";
import { audit } from "../services/audit.js";
import { PULL_KINDS, pullPage } from "../services/pull.js";
import { applyOperation } from "../services/sync.js";

const pullQuerySchema = z.object({
  after: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export function syncRouter(config) {
  const router = Router();
  router.use(requireAuth(config));

  // Applies a batch IN ORDER. Every operation gets its own result, and one failure
  // never stops the others.
  router.post(
    "/push",
    asyncHandler(async (req, res) => {
      const { ops } = parse(pushEnvelopeSchema, req.body);
      const results = [];

      for (const [index, op] of ops.entries()) {
        const id = typeof op.data?.id === "string" ? op.data.id : null;
        try {
          const result = await applyOperation(op, req);
          results.push({ index, type: op.type, id, ...result });
        } catch (err) {
          if (err instanceof AppError) {
            results.push({
              index,
              type: op.type,
              id,
              status: "rejected", // retrying will not help; a person has to look at it
              code: err.code,
              message: err.message,
              ...(err.details ? { details: err.details } : {}),
            });
          } else {
            console.error(`[${req.id}] sync operation failed`, err);
            results.push({
              index,
              type: op.type,
              id,
              status: "error", // temporary; the device will try again
              code: "INTERNAL_ERROR",
              message:
                "The server could not process this item. Try again later.",
            });
          }
        }
      }

      const count = (status) =>
        results.filter((r) => r.status === status).length;
      await audit(req, {
        action: "sync.push",
        entity: "sync",
        details: {
          total: results.length,
          applied: count("applied"),
          duplicate: count("duplicate"),
          rejected: count("rejected"),
          error: count("error"),
        },
      });

      res.json({ results });
    }),
  );

  // Download: everything of one kind that changed after a cursor, in pages. Read-only.
  // kind: products | variants | sales | movements
  router.get(
    "/pull/:kind",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const { kind } = req.params;
      if (!Object.hasOwn(PULL_KINDS, kind)) {
        throw notFound(`There is nothing to download called "${kind}"`);
      }
      const query = parse(pullQuerySchema, req.query);
      const page = await pullPage(kind, query);
      res.json({ ...page, serverTime: new Date().toISOString() });
    }),
  );

  // How much there is to download, so a new device can show its progress.
  router.get(
    "/pull-summary",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const [products, variants, sales, movements] = await Promise.all([
        Product.countDocuments(),
        Variant.countDocuments(),
        Sale.countDocuments(),
        StockMovement.countDocuments(),
      ]);
      res.json({
        serverTime: new Date().toISOString(),
        counts: { products, variants, sales, movements },
      });
    }),
  );

  // The server's clock and record counts. The app uses the clock to warn when the
  // device's own clock is wrong.
  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      res.json({
        serverTime: new Date().toISOString(),
        counts: {
          products: await Product.countDocuments(),
          variants: await Variant.countDocuments(),
          sales: await Sale.countDocuments(),
        },
      });
    }),
  );

  // Every item's stock as the server sees it, so the app can compare with its own.
  router.get(
    "/stock-levels",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const variants = await Variant.find({}, "sku currentStock status").lean();
      res.json({
        items: variants.map((v) => ({
          variantId: v._id,
          sku: v.sku,
          currentStock: v.currentStock,
          status: v.status,
        })),
      });
    }),
  );

  return router;
}
