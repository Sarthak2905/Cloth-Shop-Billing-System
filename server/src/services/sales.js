import { createHash } from "node:crypto";
import { runInTransaction } from "../db/transaction.js";
import { calculateTotals, lineGrossPaise } from "../domain/calc.js";
import { summarizePayments } from "../domain/payments.js";
import { AppError, conflict } from "../errors.js";
import { nextSequence } from "../models/Counter.js";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { getShopSettings } from "../models/Settings.js";
import { Variant } from "../models/Variant.js";
import { applyStockChange } from "./stock.js";

const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

const invalid = (field, message) =>
  new AppError(400, "VALIDATION_ERROR", "Some fields are invalid", [
    { field, message },
  ]);

// A fingerprint of what the sale says. The same id with different content is refused.
// The payment is NOT part of it (it can be recorded or changed later), except for the
// older single `payment`.
function fingerprintOf(data) {
  const lines = data.lines
    .map((l) => [
      l.variantId,
      l.quantity,
      l.unitPricePaise,
      l.discount ?? null,
      l.noDiscount === true,
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonical = {
    lines,
    billDiscount: data.billDiscount ?? null,
    legacyPayment: data.payment
      ? [data.payment.method, data.payment.amountTenderedPaise ?? null]
      : null,
    invoiceNumber: data.invoiceNumber ?? null,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function existingResult(existing, fingerprint) {
  if (existing.requestHash !== fingerprint) {
    throw conflict(
      "IDEMPOTENCY_KEY_REUSED",
      "A different sale was already saved with this id",
    );
  }
  return { sale: existing, duplicate: true };
}

// Saves a sale. Returns { sale, duplicate }.
//   online sale  : a broken shop rule REFUSES the sale (422/409)
//   offline sale : the sale already happened, so it is saved and FLAGGED instead
export async function createSale({ data, user }) {
  const settings = await getShopSettings();
  const fingerprint = fingerprintOf(data);
  const offline = data.offline === true;

  try {
    return await runInTransaction((session) =>
      saveSale({ data, user, settings, fingerprint, offline, session }),
    );
  } catch (err) {
    if (err?.code === 11000) {
      const fields = Object.keys(err.keyPattern ?? err.keyValue ?? {});
      if (fields.includes("_id")) {
        // Another request saved this same sale at the same moment.
        const existing = await Sale.findById(data.id);
        if (existing) return existingResult(existing, fingerprint);
      }
      if (fields.includes("invoiceNumber")) {
        throw conflict(
          "INVOICE_NUMBER_TAKEN",
          "That invoice number is already used by another sale",
        );
      }
    }
    throw err;
  }
}

async function saveSale({
  data,
  user,
  settings,
  fingerprint,
  offline,
  session,
}) {
  // 1. Already saved? Then this is a repeat of the same request.
  const existing = await Sale.findById(data.id).session(session);
  if (existing) return existingResult(existing, fingerprint);

  // 2. The sale time must not be in the future.
  const now = new Date();
  const soldAt = data.soldAt ? new Date(data.soldAt) : now;
  if (soldAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw invalid("soldAt", "The sale time is in the future");
  }

  // 3. Load the items and their products.
  const variants = await Variant.find({
    _id: { $in: data.lines.map((l) => l.variantId) },
  }).session(session);
  const variantById = new Map(variants.map((v) => [v._id, v]));
  const products = await Product.find({
    _id: { $in: [...new Set(variants.map((v) => v.productId))] },
  }).session(session);
  const productById = new Map(products.map((p) => [p._id, p]));

  // 4. Check every line against the catalogue. Problems are collected, not thrown.
  const violations = [];
  const lineViews = data.lines.map((line) => {
    const variant = variantById.get(line.variantId);
    if (!variant) {
      throw new AppError(
        422,
        "UNKNOWN_VARIANT",
        `Item ${line.variantId} does not exist`,
        [{ variantId: line.variantId }],
      );
    }
    const product = productById.get(variant.productId);
    const label = `${product?.name ?? "Item"}${variant.size ? ` (size ${variant.size})` : ""}`;

    if (variant.status !== "active" || product?.status !== "active") {
      violations.push({
        code: "ITEM_ARCHIVED",
        variantId: variant._id,
        message: `${label} is archived`,
      });
    }
    if (line.unitPricePaise !== variant.sellingPricePaise) {
      violations.push({
        code: "PRICE_DIFFERS_FROM_CATALOG",
        variantId: variant._id,
        message: `${label} was sold at ${line.unitPricePaise} paise, the catalogue price is ${variant.sellingPricePaise}`,
      });
    }
    if (line.unitPricePaise > variant.mrpPaise) {
      violations.push({
        code: "PRICE_ABOVE_MRP",
        variantId: variant._id,
        message: `${label} was sold above its MRP`,
      });
    }

    // A product that never takes a discount. An offline sale carries its own decision
    // (noDiscount); an online sale follows the product.
    const neverDiscounted = product?.discountAllowed === false;
    if (neverDiscounted && line.discount) {
      violations.push({
        code: "DISCOUNT_NOT_ALLOWED",
        variantId: variant._id,
        message: `${label} does not allow discounts`,
      });
    }
    const excluded = line.noDiscount === true || neverDiscounted;
    return { line, variant, product, label, excluded };
  });

  // 5. The server's own calculation. Tax settings and the unit come from the catalogue.
  const options = { roundToRupee: settings.roundToRupee };
  const cart = {
    lines: lineViews.map(({ line, variant, excluded }) => ({
      variantId: variant._id,
      unit: variant.unit ?? "piece",
      unitPricePaise: line.unitPricePaise,
      quantity: line.quantity,
      taxRatePercent: variant.taxRatePercent,
      priceIncludesTax: variant.priceIncludesTax,
      discount: line.discount ?? null,
      discountExcluded: excluded,
    })),
    billDiscount: data.billDiscount ?? null,
  };

  // Impossible discounts are refused in every mode.
  for (const { line, variant } of lineViews) {
    const gross = lineGrossPaise({
      unit: variant.unit ?? "piece",
      unitPricePaise: line.unitPricePaise,
      quantity: line.quantity,
    });
    if (line.discount?.type === "amount" && line.discount.value > gross) {
      throw invalid("lines", "A discount cannot be more than the item total");
    }
  }
  const beforeBillDiscount = calculateTotals(
    { ...cart, billDiscount: null },
    options,
  );
  if (cart.billDiscount) {
    if (beforeBillDiscount.eligibleBasePaise === 0) {
      violations.push({
        code: "DISCOUNT_NOT_ALLOWED",
        message: "No item on this bill can take a bill discount",
      });
    } else if (
      cart.billDiscount.type === "amount" &&
      cart.billDiscount.value > beforeBillDiscount.eligibleBasePaise
    ) {
      throw invalid(
        "billDiscount",
        "A discount cannot be more than the bill total",
      );
    }
  }

  const totals = calculateTotals(cart, options);

  // A never-discounted product that still got a share of the bill discount.
  lineViews.forEach(({ variant, product, label }, index) => {
    if (
      product?.discountAllowed === false &&
      totals.lines[index].billDiscountSharePaise > 0
    ) {
      violations.push({
        code: "DISCOUNT_NOT_ALLOWED",
        variantId: variant._id,
        message: `${label} does not allow discounts`,
      });
    }
  });

  // 6. Cashier discount limit (admins are not limited). A little slack for rounding.
  if (user.role === "cashier") {
    const limitBp = Math.round(settings.maxCashierDiscountPercent * 100);
    const allowed =
      Math.ceil((totals.subtotalPaise * limitBp) / 10000) +
      cart.lines.length +
      1;
    if (totals.discountPaise > allowed) {
      violations.push({
        code: "DISCOUNT_OVER_LIMIT",
        message: `The discount is more than the ${settings.maxCashierDiscountPercent}% a cashier may give`,
      });
    }
  }

  // 7. The total the client claims must match the server's total.
  if (
    data.claimedTotalPaise !== undefined &&
    data.claimedTotalPaise !== totals.totalPaise
  ) {
    violations.push({
      code: "TOTAL_MISMATCH",
      message: `The total sent (${data.claimedTotalPaise}) differs from the calculated total (${totals.totalPaise})`,
    });
  }

  // 8. Payment. Three shapes: a list (cash + UPI + card; empty = pending), the older
  //    single payment, or none (= pending, paid later). A short amount is a bargain and is
  //    accepted; the older single payment keeps its old rule.
  let paid;
  if (Array.isArray(data.payments)) {
    paid = summarizePayments(totals.totalPaise, data.payments);
    if (paid.error) throw invalid("payments", paid.error);
  } else if (data.payment) {
    const isCash = data.payment.method === "cash";
    const tendered = isCash
      ? (data.payment.amountTenderedPaise ?? totals.totalPaise)
      : totals.totalPaise;
    if (tendered < totals.totalPaise) {
      if (!offline)
        throw new AppError(
          400,
          "INSUFFICIENT_PAYMENT",
          "Cash received is less than the total",
        );
      violations.push({
        code: "PAYMENT_SHORT",
        message: `The amount received (${tendered}) is less than the total (${totals.totalPaise})`,
      });
    }
    paid = summarizePayments(totals.totalPaise, [
      {
        method: data.payment.method,
        amountPaise: tendered,
        reference: data.payment.reference,
      },
    ]);
    if (paid.error) throw invalid("payment", paid.error);
  } else {
    paid = summarizePayments(totals.totalPaise, []);
  }

  // 9. An online sale that breaks any rule is refused. An offline one is flagged.
  if (violations.length > 0 && !offline) {
    throw new AppError(
      422,
      "SALE_NOT_ALLOWED",
      "This sale breaks a shop rule",
      violations,
    );
  }
  const flags = [...violations];

  // 10. Invoice number: keep the device's own, or allocate one from the server series.
  let invoiceNumber = data.invoiceNumber;
  if (!invoiceNumber) {
    const sequence = await nextSequence("invoice", session);
    invoiceNumber = `${settings.invoicePrefix}-S${String(sequence).padStart(6, "0")}`;
  }

  // 11. Stock. A fixed order keeps concurrent sales from blocking each other.
  const ordered = [...lineViews].sort((a, b) =>
    a.variant._id < b.variant._id ? -1 : 1,
  );
  for (const { line, variant } of ordered) {
    const { variant: after } = await applyStockChange({
      variantId: variant._id,
      quantityChange: -line.quantity,
      type: "sale",
      referenceId: data.id,
      userId: user._id,
      allowNegative: offline || settings.allowNegativeStock,
      session,
    });
    if (offline && !settings.allowNegativeStock && after.currentStock < 0) {
      flags.push({
        code: "STOCK_SHORTFALL",
        variantId: variant._id,
        message: `${variant.sku || variant.barcode} is now ${-after.currentStock} below zero`,
      });
    }
  }

  // 12. Save the sale with a snapshot of every line.
  const items = lineViews.map(({ line, variant, product, excluded }, index) => {
    const t = totals.lines[index];
    return {
      lineNumber: index + 1,
      variantId: variant._id,
      productId: variant.productId,
      productName: product?.name ?? "",
      sku: variant.sku,
      barcode: variant.barcode,
      size: variant.size,
      unit: variant.unit ?? "piece",
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      mrpPaise: variant.mrpPaise,
      // what it cost when it was sold (the device's own record when it sent one)
      costPaise: line.costPaise ?? variant.costPaise,
      taxRatePercent: variant.taxRatePercent,
      priceIncludesTax: variant.priceIncludesTax,
      discount: line.discount ?? null,
      discountAllowed: product?.discountAllowed !== false,
      discountExcluded: excluded,
      grossPaise: t.grossPaise,
      lineDiscountPaise: t.lineDiscountPaise,
      billDiscountSharePaise: t.billDiscountSharePaise,
      taxableValuePaise: t.taxableValuePaise,
      taxPaise: t.taxPaise,
      lineTotalPaise: t.lineTotalPaise,
    };
  });

  const [sale] = await Sale.create(
    [
      {
        _id: data.id,
        invoiceNumber,
        status: "completed",
        replacesSaleId: data.replacesSaleId ?? null,
        replacesInvoice: data.replacesInvoice ?? "",
        source: offline ? "offline-sync" : "online",
        soldAt,
        cashierId: user._id,
        cashierName: user.displayName,
        shop: {
          name: settings.shopName,
          address: settings.address,
          phone: settings.phone,
          taxId: settings.taxId,
          footer: settings.receiptFooter,
        },
        itemCount: totals.itemCount,
        subtotalPaise: totals.subtotalPaise,
        itemDiscountPaise: totals.itemDiscountPaise,
        billDiscountPaise: totals.billDiscountPaise,
        discountPaise: totals.discountPaise,
        billDiscount: cart.billDiscount,
        taxableValuePaise: totals.taxableValuePaise,
        taxPaise: totals.taxPaise,
        taxIncludedPaise: totals.taxIncludedPaise,
        taxAddedPaise: totals.taxAddedPaise,
        exactTotalPaise: totals.exactTotalPaise,
        roundOffPaise: totals.roundOffPaise,
        totalPaise: totals.totalPaise,
        payment: {
          method: paid.summary.method,
          amountTenderedPaise: paid.summary.amountTenderedPaise,
          changePaise: paid.summary.changePaise,
          reference: paid.summary.reference,
        },
        payments: paid.payments,
        paymentStatus: paid.status,
        receivedPaise: paid.receivedPaise,
        shortPaise: paid.shortPaise,
        paymentRecordedAt: paid.status === "paid" ? soldAt : null,
        items,
        flags,
        flagged: flags.length > 0,
        requestHash: fingerprint,
      },
    ],
    { session },
  );

  return { sale, duplicate: false };
}
