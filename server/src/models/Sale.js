import mongoose from "mongoose";

const { Schema } = mongoose;

const wholeNumber = {
  validator: Number.isInteger,
  message: "{PATH} must be a whole number",
};
const int = (extra = {}) => ({
  type: Number,
  required: true,
  validate: wholeNumber,
  ...extra,
});

const discountSchema = new Schema(
  {
    type: { type: String, enum: ["percent", "amount"], required: true },
    value: { type: Number, required: true },
  },
  { _id: false },
);

// A snapshot of one line as it was sold. Later catalogue changes never touch it.
// quantity is pieces, or whole centimetres for fabric (unit 'meter').
const itemSchema = new Schema(
  {
    lineNumber: int({ min: 1 }),
    variantId: { type: String, required: true },
    productId: { type: String, required: true },
    productName: { type: String, default: "" },
    sku: { type: String, default: "" },
    barcode: { type: String, required: true },
    size: { type: String, default: "" },
    unit: { type: String, enum: ["piece", "meter"], default: "piece" },
    quantity: int({ min: 1 }),
    unitPricePaise: int({ min: 0 }),
    mrpPaise: int({ min: 0 }),
    costPaise: int({ min: 0 }),
    taxRatePercent: { type: Number, required: true },
    priceIncludesTax: { type: Boolean, required: true },
    discount: { type: discountSchema, default: null },
    discountAllowed: { type: Boolean, default: true },
    discountExcluded: { type: Boolean, default: false },
    grossPaise: int(),
    lineDiscountPaise: int(),
    billDiscountSharePaise: int(),
    taxableValuePaise: int(),
    taxPaise: int(),
    lineTotalPaise: int(),
  },
  { _id: false },
);

const flagSchema = new Schema(
  {
    code: { type: String, required: true },
    message: { type: String, default: "" },
    variantId: { type: String, default: null },
  },
  { _id: false },
);

// One way of paying. A bill can have several (cash + UPI + card).
const paymentLineSchema = new Schema(
  {
    method: { type: String, enum: ["cash", "upi", "card"], required: true },
    amountPaise: int({ min: 0 }),
    reference: { type: String, default: "" },
  },
  { _id: false },
);

const saleSchema = new Schema(
  {
    _id: { type: String, required: true }, // the id made by the device: also the idempotency key
    invoiceNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
      index: true,
    },
    // A cancelled bill is kept (the invoice number series stays complete). Usually a
    // corrected bill replaces it.
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: "" },
    replacedBySaleId: { type: String, default: null },
    replacedByInvoice: { type: String, default: "" },
    replacesSaleId: { type: String, default: null },
    replacesInvoice: { type: String, default: "" },

    source: { type: String, enum: ["online", "offline-sync"], required: true },
    soldAt: { type: Date, required: true },
    cashierId: { type: String, required: true },
    cashierName: { type: String, default: "" },

    shop: {
      name: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      taxId: { type: String, default: "" },
      footer: { type: String, default: "" },
    },

    itemCount: int({ min: 1 }),
    subtotalPaise: int(),
    itemDiscountPaise: int(),
    billDiscountPaise: int(),
    discountPaise: int(),
    billDiscount: { type: discountSchema, default: null },
    taxableValuePaise: int(),
    taxPaise: int(),
    taxIncludedPaise: int(),
    taxAddedPaise: int(),
    exactTotalPaise: int(),
    roundOffPaise: int(),
    totalPaise: int({ min: 0 }),

    // The payment is the shop's own record. It is never part of the customer's bill.
    // `payment` is a summary ('split' = several ways, 'pending' = not paid yet).
    payment: {
      method: {
        type: String,
        enum: ["cash", "upi", "card", "split", "pending"],
        required: true,
      },
      amountTenderedPaise: int({ min: 0 }),
      changePaise: int({ min: 0 }),
      reference: { type: String, default: "" },
    },
    payments: { type: [paymentLineSchema], default: [] },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending"],
      default: "paid",
      index: true,
    },
    receivedPaise: { type: Number, default: 0, validate: wholeNumber },
    shortPaise: { type: Number, default: 0, validate: wholeNumber }, // a bargain: accepted
    paymentRecordedAt: { type: Date, default: null },
    paymentRev: { type: Number, default: 0, validate: wholeNumber },

    items: { type: [itemSchema], default: [] },
    flags: { type: [flagSchema], default: [] },
    flagged: { type: Boolean, default: false, index: true },

    requestHash: { type: String, required: true },
  },
  { timestamps: true }, // createdAt = when the server received it
);
saleSchema.index({ soldAt: -1 });
saleSchema.index({ cashierId: 1, soldAt: -1 });

export const Sale = mongoose.models.Sale ?? mongoose.model("Sale", saleSchema);

// What a client is allowed to see. Cost prices are for admins only.
export function publicSale(
  sale,
  { includeCost = false, includeItems = true } = {},
) {
  const out = {
    id: sale._id,
    invoiceNumber: sale.invoiceNumber,
    status: sale.status,
    cancelledAt: sale.cancelledAt ?? null,
    cancelReason: sale.cancelReason ?? "",
    replacedBySaleId: sale.replacedBySaleId ?? null,
    replacedByInvoice: sale.replacedByInvoice ?? "",
    replacesSaleId: sale.replacesSaleId ?? null,
    replacesInvoice: sale.replacesInvoice ?? "",
    source: sale.source,
    soldAt: sale.soldAt,
    createdAt: sale.createdAt,
    cashierId: sale.cashierId,
    cashierName: sale.cashierName,
    shop: {
      name: sale.shop?.name ?? "",
      address: sale.shop?.address ?? "",
      phone: sale.shop?.phone ?? "",
      taxId: sale.shop?.taxId ?? "",
      footer: sale.shop?.footer ?? "",
    },
    itemCount: sale.itemCount,
    subtotalPaise: sale.subtotalPaise,
    itemDiscountPaise: sale.itemDiscountPaise,
    billDiscountPaise: sale.billDiscountPaise,
    discountPaise: sale.discountPaise,
    billDiscount: sale.billDiscount
      ? { type: sale.billDiscount.type, value: sale.billDiscount.value }
      : null,
    taxableValuePaise: sale.taxableValuePaise,
    taxPaise: sale.taxPaise,
    taxIncludedPaise: sale.taxIncludedPaise,
    taxAddedPaise: sale.taxAddedPaise,
    exactTotalPaise: sale.exactTotalPaise,
    roundOffPaise: sale.roundOffPaise,
    totalPaise: sale.totalPaise,
    payment: {
      method: sale.payment.method,
      amountTenderedPaise: sale.payment.amountTenderedPaise,
      changePaise: sale.payment.changePaise,
      reference: sale.payment.reference,
    },
    payments: (sale.payments ?? []).map((p) => ({
      method: p.method,
      amountPaise: p.amountPaise,
      reference: p.reference,
    })),
    paymentStatus: sale.paymentStatus ?? "paid",
    receivedPaise: sale.receivedPaise ?? 0,
    shortPaise: sale.shortPaise ?? 0,
    paymentRecordedAt: sale.paymentRecordedAt ?? null,
    flagged: sale.flagged,
    flags: sale.flags.map((flag) => ({
      code: flag.code,
      message: flag.message,
      variantId: flag.variantId,
    })),
  };

  if (includeItems) {
    out.items = sale.items.map((item) => {
      const view = {
        lineNumber: item.lineNumber,
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        barcode: item.barcode,
        size: item.size,
        unit: item.unit ?? "piece",
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        mrpPaise: item.mrpPaise,
        taxRatePercent: item.taxRatePercent,
        priceIncludesTax: item.priceIncludesTax,
        discount: item.discount
          ? { type: item.discount.type, value: item.discount.value }
          : null,
        discountAllowed: item.discountAllowed !== false,
        discountExcluded: item.discountExcluded === true,
        grossPaise: item.grossPaise,
        lineDiscountPaise: item.lineDiscountPaise,
        billDiscountSharePaise: item.billDiscountSharePaise,
        taxableValuePaise: item.taxableValuePaise,
        taxPaise: item.taxPaise,
        lineTotalPaise: item.lineTotalPaise,
      };
      if (includeCost) view.costPaise = item.costPaise;
      return view;
    });
  }
  return out;
}
