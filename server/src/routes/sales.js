import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { saleCreateSchema } from "../domain/saleSchemas.js";
import { notFound } from "../errors.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { pageInfo, paginationFields } from "../http/pagination.js";
import { parse } from "../http/validate.js";
import { escapeRegex } from "../lib/text.js";
import { Sale, publicSale } from "../models/Sale.js";
import { audit } from "../services/audit.js";
import { createSale } from "../services/sales.js";

const isDate = (text) => !Number.isNaN(Date.parse(text));

const listSchema = z.object({
  search: z.string().trim().max(30).optional(),
  from: z.string().refine(isDate, "Not a valid date").optional(),
  to: z.string().refine(isDate, "Not a valid date").optional(),
  flagged: z.enum(["true", "false"]).optional(),
  cashierId: z.string().min(1).max(64).optional(),
  ...paginationFields,
});

export function salesRouter(config) {
  const router = Router();
  router.use(requireAuth(config));

  const isAdmin = (req) => req.user.role === "admin";
  // Cashiers only ever see their own sales.
  const ownOnly = (req) => (isAdmin(req) ? {} : { cashierId: req.user._id });
  const view = (req) => ({ includeCost: isAdmin(req) });

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const data = parse(saleCreateSchema, req.body);
      const { sale, duplicate } = await createSale({ data, user: req.user });

      if (!duplicate) {
        await audit(req, {
          action: "sale.created",
          entity: "sale",
          entityId: sale._id,
          details: {
            invoiceNumber: sale.invoiceNumber,
            totalPaise: sale.totalPaise,
            source: sale.source,
            flags: sale.flags.map((flag) => flag.code),
          },
        });
      }
      res
        .status(duplicate ? 200 : 201)
        .json({ sale: publicSale(sale, view(req)), duplicate });
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parse(listSchema, req.query);
      const { skip } = pageInfo(query);

      const filter = { ...ownOnly(req) };
      if (isAdmin(req) && query.cashierId) filter.cashierId = query.cashierId;
      if (query.flagged !== undefined)
        filter.flagged = query.flagged === "true";
      if (query.search)
        filter.invoiceNumber = new RegExp(escapeRegex(query.search), "i");
      if (query.from || query.to) {
        filter.soldAt = {
          ...(query.from ? { $gte: new Date(query.from) } : {}),
          ...(query.to ? { $lte: new Date(query.to) } : {}),
        };
      }

      const [sales, total] = await Promise.all([
        Sale.find(filter)
          .select("-items -requestHash")
          .sort({ soldAt: -1, _id: -1 })
          .skip(skip)
          .limit(query.limit),
        Sale.countDocuments(filter),
      ]);
      res.json({
        items: sales.map((sale) =>
          publicSale(sale, { ...view(req), includeItems: false }),
        ),
        page: query.page,
        limit: query.limit,
        total,
      });
    }),
  );

  // Declared before "/:id" so "by-invoice" is not mistaken for an id.
  router.get(
    "/by-invoice/:invoiceNumber",
    asyncHandler(async (req, res) => {
      const sale = await Sale.findOne({
        invoiceNumber: String(req.params.invoiceNumber),
        ...ownOnly(req),
      });
      if (!sale) throw notFound("Sale not found");
      res.json({ sale: publicSale(sale, view(req)) });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const sale = await Sale.findOne({ _id: req.params.id, ...ownOnly(req) });
      if (!sale) throw notFound("Sale not found");
      res.json({ sale: publicSale(sale, view(req)) });
    }),
  );

  // There is deliberately no way to edit or delete a completed sale.
  return router;
}
