import { db } from './db.js'
import { settingsSchema, validate } from './schemas.js'

export const DEFAULT_SETTINGS = {
  shopName: 'My Clothing Store',
  address: '',
  phone: '',
  taxId: '',
  invoicePrefix: 'INV',
  receiptFooter: '',
  receiptPaperWidth: '58',
  receiptPrinter: 'simulated:ok',
  receiptTextSize: 'large',
  receiptLanguage: 'en',
  autoPrintReceipt: false,
  allowNegativeStock: false,
  roundToRupee: true,
}

export async function getSettings() {
  const rows = await db.settings.toArray()
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function updateSettings(changes) {
  const data = validate(settingsSchema.partial(), changes)
  const rows = Object.entries(data).map(([key, value]) => ({ key, value }))
  await db.settings.bulkPut(rows)
  return getSettings()
}
