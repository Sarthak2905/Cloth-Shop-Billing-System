import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { parse } from "../http/validate.js";
import { getShopSettings, publicSettings } from "../models/Settings.js";
import { audit } from "../services/audit.js";

const updateSchema = z
  .object({
    shopName: z.string().trim().min(1).max(80),
    address: z.string().trim().max(200),
    phone: z.string().trim().max(20),
    taxId: z.string().trim().max(20),
    invoicePrefix: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{1,6}$/, "Use 1-6 capital letters or digits"),
    receiptFooter: z.string().trim().max(120),
    receiptPaperWidth: z.enum(["58", "80"]),
    allowNegativeStock: z.boolean(),
    roundToRupee: z.boolean(),
    maxCashierDiscountPercent: z.number().min(0).max(100),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export function settingsRouter(config) {
  const router = Router();
  const authenticate = requireAuth(config);

  router.get(
    "/",
    authenticate,
    asyncHandler(async (req, res) => {
      res.json({ settings: publicSettings(await getShopSettings()) });
    }),
  );

  router.patch(
    "/",
    authenticate,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const changes = parse(updateSchema, req.body);
      const settings = await getShopSettings();
      Object.assign(settings, changes);
      await settings.save();

      await audit(req, {
        action: "settings.updated",
        entity: "settings",
        entityId: "shop",
        details: { changes },
      });
      res.json({ settings: publicSettings(settings) });
    }),
  );

  return router;
}
