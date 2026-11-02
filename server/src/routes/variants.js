import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { runInTransaction } from "../db/transaction.js";
import {
  barcodeParamSchema,
  stockAdjustmentSchema,
  variantUpdateSchema,
} from "../domain/catalogSchemas.js";
import { AppError, notFound } from "../errors.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { translateDuplicate } from "../http/duplicates.js";
import { pageInfo, paginationFields } from "../http/pagination.js";
import { parse } from "../http/validate.js";
import { escapeRegex } from "../lib/text.js";
import { Product, publicProduct } from "../models/Product.js";
import { getShopSettings } from "../models/Settings.js";
import { StockMovement, publicMovement } from "../models/StockMovement.js";
import { Variant, publicVariant } from "../models/Variant.js";
import { audit } from "../services/audit.js";
import { applyStockChange } from "../services/stock.js";

const listSchema = z.object({
  productId: z.string().min(1).max(64).optional(),
  search: z.string().trim().max(60).optional(),
  status: z.enum(["active", "archived", "all"]).default("active"),
  lowStock: z.enum(["true", "false"]).optional(),
  ...paginationFields,
});

const movementsSchema = z.object({ ...paginationFields });

export function variantsRouter(config) {
  const router = Router();
  router.use(requireAuth(config));
  const adminOnly = requireRole("admin");
  const view = (req) => ({ includeCost: req.user.role === "admin" });

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = parse(listSchema, req.query);
      const { skip } = pageInfo(query);

      const filter = {};
      if (query.productId) filter.productId = query.productId;
      if (query.status !== "all") filter.status = query.status;
      if (query.lowStock === "true") {
        filter.$expr = { $lte: ["$currentStock", "$reorderThreshold"] };
      }
      if (query.search) {
        const pattern = new RegExp(escapeRegex(query.search), "i");
        const matchingProducts = await Product.find(
          { name: pattern },
          "_id",
        ).lean();
        filter.$or = [
          { sku: pattern },
          { barcode: pattern },
          { productId: { $in: matchingProducts.map((p) => p._id) } },
        ];
      }

      const [variants, total] = await Promise.all([
        Variant.find(filter).sort({ sku: 1 }).skip(skip).limit(query.limit),
        Variant.countDocuments(filter),
      ]);

      const products = await Product.find(
        { _id: { $in: [...new Set(variants.map((v) => v.productId))] } },
        "name",
      ).lean();
      const names = new Map(products.map((p) => [p._id, p.name]));

      res.json({
        items: variants.map((v) => ({
          ...publicVariant(v, view(req)),
          productName: names.get(v.productId) ?? null,
        })),
        page: query.page,
        limit: query.limit,
        total,
      });
    }),
  );

  // Declared before "/:id" so "barcode" is not mistaken for an id.
  router.get(
    "/barcode/:barcode",
    asyncHandler(async (req, res) => {
      const barcode = parse(barcodeParamSchema, req.params.barcode);
      const variant = await Variant.findOne({ barcode });
      if (!variant) throw notFound(`No product found for barcode ${barcode}`);

      const product = await Product.findById(variant.productId);
      res.json({
        variant: publicVariant(variant, view(req)),
        product: product ? publicProduct(product) : null,
        sellable: variant.status === "active" && product?.status === "active",
      });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const variant = await Variant.findById(req.params.id);
      if (!variant) throw notFound("Variant not found");
      res.json({ variant: publicVariant(variant, view(req)) });
    }),
  );

  router.patch(
    "/:id",
    adminOnly,
    asyncHandler(async (req, res) => {
      const changes = parse(variantUpdateSchema, req.body);
      const variant = await Variant.findById(req.params.id);
      if (!variant) throw notFound("Variant not found");

      const nextSelling =
        changes.sellingPricePaise ?? variant.sellingPricePaise;
      const nextMrp = changes.mrpPaise ?? variant.mrpPaise;
      if (nextSelling > nextMrp) {
        throw new AppError(400, "VALIDATION_ERROR", "Some fields are invalid", [
          {
            field: "sellingPricePaise",
            message: "Selling price cannot exceed MRP",
          },
        ]);
      }

      const changed = {};
      for (const [field, value] of Object.entries(changes)) {
        if (variant[field] !== value) {
          changed[field] = { from: variant[field], to: value };
          variant[field] = value;
        }
      }

      if (Object.keys(changed).length > 0) {
        try {
          await variant.save();
        } catch (err) {
          throw translateDuplicate(err, changes);
        }
        await audit(req, {
          action: "variant.updated",
          entity: "variant",
          entityId: variant._id,
          details: { sku: variant.sku, changes: changed },
        });
      }
      res.json({ variant: publicVariant(variant, { includeCost: true }) });
    }),
  );

  router.post(
    "/:id/stock-adjustments",
    adminOnly,
    asyncHandler(async (req, res) => {
      const { quantityChange, reason } = parse(stockAdjustmentSchema, req.body);
      const settings = await getShopSettings();

      const { variant, movement } = await runInTransaction((session) =>
        applyStockChange({
          variantId: req.params.id,
          quantityChange,
          type: "adjustment",
          reason,
          userId: req.user._id,
          allowNegative: settings.allowNegativeStock,
          session,
        }),
      );

      await audit(req, {
        action: "stock.adjusted",
        entity: "variant",
        entityId: variant._id,
        details: {
          sku: variant.sku,
          quantityChange,
          reason,
          stockAfter: variant.currentStock,
        },
      });
      res.status(201).json({
        variant: publicVariant(variant, { includeCost: true }),
        movement: publicMovement(movement),
      });
    }),
  );

  router.get(
    "/:id/stock-movements",
    adminOnly,
    asyncHandler(async (req, res) => {
      const query = parse(movementsSchema, req.query);
      const { skip } = pageInfo(query);

      if (!(await Variant.exists({ _id: req.params.id })))
        throw notFound("Variant not found");

      const filter = { variantId: req.params.id };
      const [items, total] = await Promise.all([
        StockMovement.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(query.limit),
        StockMovement.countDocuments(filter),
      ]);
      res.json({
        items: items.map(publicMovement),
        page: query.page,
        limit: query.limit,
        total,
      });
    }),
  );

  return router;
}
