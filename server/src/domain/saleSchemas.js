import { z } from "zod";

const paise = z.number().int().min(0).max(100_000_000);

// A discount is { type: 'percent', value: 10 } or { type: 'amount', value: <paise> }.
const discountSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("percent"), value: z.number().gt(0).max(100) })
    .strict(),
  z
    .object({
      type: z.literal("amount"),
      value: z.number().int().gt(0).max(100_000_000),
    })
    .strict(),
]);

// quantity: pieces, or whole CENTIMETRES for fabric sold by the meter.
const lineSchema = z
  .object({
    variantId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(1_000_000),
    unitPricePaise: paise,
    discount: discountSchema.nullable().optional(),
    // the cashier switched bill discounts off for this item on this bill
    noDiscount: z.boolean().optional(),
    // what the item cost when it was sold (a device sends it; otherwise the catalogue cost is used)
    costPaise: paise.optional(),
  })
  .strict();

// One way of paying: the amount received in cash, UPI or card.
export const paymentLineSchema = z
  .object({
    method: z.enum(["cash", "upi", "card"]),
    amountPaise: paise,
    reference: z.string().trim().max(40).optional(),
  })
  .strict();

const isDate = (text) => !Number.isNaN(Date.parse(text));

// Note what is NOT accepted: totals, tax, product names. The server works those out
// itself. `claimedTotalPaise` is only compared with the server's total.
// Payment: `payments` (cash + UPI + card, or empty = payment pending), or the older
// single `payment`. With neither, the sale is saved as payment pending.
export const saleCreateSchema = z
  .object({
    id: z.string().uuid(),
    invoiceNumber: z
      .string()
      .regex(/^[A-Z0-9]{1,6}-\d{1,9}$/, "Use a format like INV-000123")
      .optional(),
    soldAt: z.string().refine(isDate, "Not a valid date and time").optional(),
    offline: z.boolean().optional(),
    lines: z.array(lineSchema).min(1).max(200),
    billDiscount: discountSchema.nullable().optional(),
    payment: z
      .object({
        method: z.enum(["cash", "upi", "card"]),
        amountTenderedPaise: paise.optional(),
        reference: z.string().trim().max(40).optional(),
      })
      .strict()
      .optional(),
    payments: z.array(paymentLineSchema).max(6).optional(),
    claimedTotalPaise: paise.optional(),
    // set on a bill that corrects (replaces) an earlier one
    replacesSaleId: z.string().uuid().optional(),
    replacesInvoice: z.string().max(20).optional(),
  })
  .strict()
  .refine(
    (sale) =>
      new Set(sale.lines.map((l) => l.variantId)).size === sale.lines.length,
    {
      message: "Each item may appear only once. Combine the quantities.",
      path: ["lines"],
    },
  )
  .refine((sale) => !(sale.payment && sale.payments), {
    message: "Send either payment or payments, not both",
    path: ["payments"],
  });
