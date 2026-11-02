import mongoose from "mongoose";

// One document for the whole shop, with the fixed id "shop".
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "shop" },
    shopName: {
      type: String,
      default: "My Clothing Store",
      trim: true,
      maxlength: 80,
    },
    address: { type: String, default: "", trim: true, maxlength: 200 },
    phone: { type: String, default: "", trim: true, maxlength: 20 },
    taxId: { type: String, default: "", trim: true, maxlength: 20 },
    invoicePrefix: { type: String, default: "INV", match: /^[A-Z0-9]{1,6}$/ },
    receiptFooter: { type: String, default: "", trim: true, maxlength: 120 },
    receiptPaperWidth: { type: String, enum: ["58", "80"], default: "58" },
    allowNegativeStock: { type: Boolean, default: false },
    roundToRupee: { type: Boolean, default: true },
    // Used for sales from cashiers (Phase 9c).
    maxCashierDiscountPercent: { type: Number, default: 10, min: 0, max: 100 },
  },
  { timestamps: true },
);

export const Settings =
  mongoose.models.Settings ?? mongoose.model("Settings", settingsSchema);

export async function getShopSettings() {
  const existing = await Settings.findById("shop");
  if (existing) return existing;
  try {
    return await Settings.create({ _id: "shop" });
  } catch (err) {
    if (err?.code === 11000) return Settings.findById("shop"); // created at the same moment
    throw err;
  }
}

const PUBLIC_FIELDS = [
  "shopName",
  "address",
  "phone",
  "taxId",
  "invoicePrefix",
  "receiptFooter",
  "receiptPaperWidth",
  "allowNegativeStock",
  "roundToRupee",
  "maxCashierDiscountPercent",
];

export function publicSettings(doc) {
  return Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, doc[field]]));
}
