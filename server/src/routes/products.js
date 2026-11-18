import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { runInTransaction } from "../db/transaction.js";
import {
  productCreateSchema,
  productUpdateSchema,
  variantCreateSchema,
} from "../domain/catalogSchemas.js";
import { conflict, notFound } from "../errors.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { translateDuplicate } from "../http/duplicates.js";
import { pageInfo, paginationFields } from "../http/pagination.js";
import { parse } from "../http/validate.js";
import { escapeRegex } from "../lib/text.js";
import { Product, publicProduct } from "../models/Product.js";
import { StockMovement } from "../models/StockMovement.js";
import { Variant, publicVariant } from "../models/Variant.js";
import { audit } from "../services/audit.js";

const listSchema = z.object({
  search: z.string().trim().max(60).optional(),
  status: z.enum(["active", "archived", "all"]).default("active"),
  ...paginationFields,
});

const NATURAL_ORDER = { locale: "en", numericOrdering: true };

export function productsRouter(config) {
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
      if (query.status !== "all") filter.status = query.status;
      if (query.search) {
        const pattern = new RegExp(escapeRegex(query.search), "i");
        filter.$or = [
          { name: pattern },
          { brand: pattern },
          { category: pattern },
        ];
      }

      const [items, total] = await Promise.all([
        Product.find(filter)
          .collation({ locale: "en", strength: 2 })
          .sort({ name: 1 })
          .skip(skip)
          .limit(query.limit),
        Product.countDocuments(filter),
      ]);
      res.json({
        items: items.map(publicProduct),
        page: query.page,
        limit: query.limit,
        total,
      });
    }),
  );

  router.post(
    "/",
    adminOnly,
    asyncHandler(async (req, res) => {
      const data = parse(productCreateSchema, req.body);
      let product;
      try {
        product = await Product.create({
          // the id the app already made, so both sides know the same product
          ...(data.id ? { _id: data.id } : {}),
          name: data.name,
          category: data.category ?? "",
          brand: data.brand ?? "",
          supplier: data.supplier ?? "",
          discountAllowed: data.discountAllowed ?? true,
        });
      } catch (err) {
        throw translateDuplicate(err);
      }

      await audit(req, {
        action: "product.created",
        entity: "product",
        entityId: product._id,
        details: { name: product.name },
      });
      res.status(201).json({ product: publicProduct(product) });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const product = await Product.findById(req.params.id);
      if (!product) throw notFound("Product not found");

      const variants = await Variant.find({ productId: product._id })
        .collation(NATURAL_ORDER)
        .sort({ size: 1 });
      res.json({
        product: publicProduct(product),
        variants: variants.map((v) => publicVariant(v, view(req))),
      });
    }),
  );

  router.patch(
    "/:id",
    adminOnly,
    asyncHandler(async (req, res) => {
      const changes = parse(productUpdateSchema, req.body);
      const product = await Product.findById(req.params.id);
      if (!product) throw notFound("Product not found");

      const changed = {};
      for (const [field, value] of Object.entries(changes)) {
        if (product[field] !== value) {
          changed[field] = { from: product[field], to: value };
          product[field] = value;
        }
      }
      if (Object.keys(changed).length > 0) {
        await product.save();
        await audit(req, {
          action: "product.updated",
          entity: "product",
          entityId: product._id,
          details: { changes: changed },
        });
      }
      res.json({ product: publicProduct(product) });
    }),
  );

  // Archiving a product archives all of its variants too, in one transaction.
  router.post(
    "/:id/archive",
    adminOnly,
    asyncHandler(async (req, res) => {
      const product = await runInTransaction(async (session) => {
        const found = await Product.findById(req.params.id).session(session);
        if (!found) throw notFound("Product not found");
        found.status = "archived";
        await found.save({ session });
        await Variant.updateMany(
          { productId: found._id },
          { status: "archived" },
          { session },
        );
        return found;
      });

      await audit(req, {
        action: "product.archived",
        entity: "product",
        entityId: product._id,
        details: { name: product.name },
      });
      res.json({ product: publicProduct(product) });
    }),
  );

  // A stock entry. The same product and size can be entered any number of times; only the
  // barcode must be unique. The SKU, cost and MRP are optional.
  router.post(
    "/:productId/variants",
    adminOnly,
    asyncHandler(async (req, res) => {
      const data = parse(variantCreateSchema, req.body);

      let variant;
      try {
        variant = await runInTransaction(async (session) => {
          const product = await Product.findById(req.params.productId).session(
            session,
          );
          if (!product) throw notFound("Product not found");
          if (product.status !== "active") {
            throw conflict("PRODUCT_ARCHIVED", "This product is archived");
          }

          const openingStock = data.openingStock ?? 0;
          const [created] = await Variant.create(
            [
              {
                ...(data.id ? { _id: data.id } : {}),
                productId: product._id,
                sku: data.sku || data.barcode,
                barcode: data.barcode,
                size: data.size ?? "",
                unit: data.unit ?? "piece",
                ...(data.packSize ? { packSize: data.packSize } : {}),
                costPaise: data.costPaise ?? 0,
                mrpPaise: data.mrpPaise ?? data.sellingPricePaise,
                sellingPricePaise: data.sellingPricePaise,
                taxRatePercent: data.taxRatePercent ?? 0,
                priceIncludesTax: data.priceIncludesTax ?? true,
                reorderThreshold: data.reorderThreshold ?? 0,
                currentStock: openingStock,
              },
            ],
            { session },
          );

          if (openingStock > 0) {
            await StockMovement.create(
              [
                {
                  variantId: created._id,
                  type: "opening",
                  quantityChange: openingStock,
                  stockAfter: openingStock,
                  reason: "Opening stock",
                  userId: req.user._id,
                },
              ],
              { session },
            );
          }
          return created;
        });
      } catch (err) {
        throw translateDuplicate(err, data);
      }

      await audit(req, {
        action: "variant.created",
        entity: "variant",
        entityId: variant._id,
        details: {
          sku: variant.sku,
          barcode: variant.barcode,
          openingStock: variant.currentStock,
        },
      });
      res
        .status(201)
        .json({ variant: publicVariant(variant, { includeCost: true }) });
    }),
  );

  return router;
}
