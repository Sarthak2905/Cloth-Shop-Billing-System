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

const lineSchema = z
  .object({
    variantId: z.string().min(1).max(64),
    quantity: z.number().int().min(1).max(9999),
    unitPricePaise: paise,
    discount: discountSchema.nullable().optional(),
  })
  .strict();

const isDate = (text) => !Number.isNaN(Date.parse(text));

// Note what is NOT accepted: totals, tax, product names, cost. The server works
// those out itself. `claimedTotalPaise` is only compared with the server's total.
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
      .strict(),
    claimedTotalPaise: paise.optional(),
  })
  .strict()
  .refine(
    (sale) =>
      new Set(sale.lines.map((l) => l.variantId)).size === sale.lines.length,
    {
      message: "Each item may appear only once. Combine the quantities.",
      path: ["lines"],
    },
  );
