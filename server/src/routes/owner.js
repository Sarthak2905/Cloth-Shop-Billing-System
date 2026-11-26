import { Router } from "express";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { buildDashboard } from "../services/ownerDashboard.js";

// Everything in the owner area is for the admin only. A cashier gets a 403.
export function ownerRouter(config) {
  const router = Router();
  router.use(requireAuth(config));
  router.use(requireRole("admin"));

  router.get(
    "/dashboard",
    asyncHandler(async (req, res) => {
      res.json(await buildDashboard());
    }),
  );

  return router;
}
