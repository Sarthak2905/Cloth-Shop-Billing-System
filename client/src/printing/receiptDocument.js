import { formatDateTime } from '../lib/format.js'
import { paiseToRupees } from '../lib/money.js'
import { formatQuantity } from '../lib/quantity.js'
import { LABELS, buildReceipt } from './receiptBuilder.js'
import { groupReceiptItems, sizeText } from './receiptItems.js'

const money = (paise) => paiseToRupees(paise)
const signed = (paise) => `${paise < 0 ? '-' : '+'}${money(Math.abs(paise))}`

// Labels for corrected / cancelled bills. The Marathi wording is a draft:
// please have it checked by someone who reads Marathi well.
const EXTRA = {
  en: {
    cancelled: 'CANCELLED',
    replacedBy: 'Replaced by',
    replaces: 'Replaces bill',
  },
  mr: {
    cancelled: 'रद्द केलेले बिल',
    replacedBy: 'नवीन बिल क्र.',
    replaces: 'सुधारित बिल, मूळ क्र.',
  },
}

// The tax in the bill, one entry per tax rate: [[5, 6133], [12, 2000]] (rate, paise).
function gstByRate(items) {
  const totals = new Map()
  for (const item of items) {
    const rate = Number(item.taxRatePercent ?? 0)
    const tax = item.taxPaise ?? 0
    if (rate > 0 && tax > 0) totals.set(rate, (totals.get(rate) ?? 0) + tax)
  }
  return [...totals.entries()].sort((a, b) => a[0] - b[0])
}

// The customer's bill. It has NO payment lines (no Payment, Received or Change): the
// payment is the shop's own record, so the bill is the same before and after it is known.
// The receipt is a list of blocks (a centred line, a row with a left and a right
// part, a divider...). A block has no idea how many characters fit on a line: the
// printer layout decides that, so any language wraps and aligns properly.
export function buildReceiptDocument(
  sale,
  items,
  {
    paperWidth = '58',
    language = 'en',
    reprint = false,
    textSize = 'large',
  } = {},
) {
  const t = LABELS[language] ?? LABELS.en
  const x = EXTRA[language] ?? EXTRA.en
  const shop = sale.shop ?? {}
  const blocks = []

  const center = (text, options = {}) => {
    const value = String(text ?? '').trim()
    if (value) blocks.push({ kind: 'center', text: value, ...options })
  }
  const row = (left, right, options = {}) =>
    blocks.push({ kind: 'row', left, right, ...options })
  const divider = (style = 'dash') => blocks.push({ kind: 'divider', style })

  // Header: shop name, then each address line on its own centred line, then the phone.
  center(shop.name, { bold: true, big: true })
  for (const part of String(shop.address ?? '').split('\n')) center(part)
  if (shop.phone) center(`${t.phone}: ${shop.phone}`)
  if (shop.taxId) center(`${t.taxId}: ${shop.taxId}`)
  divider()
  if (reprint) center(t.duplicate, { bold: true })
  if (sale.status === 'cancelled') {
    center(x.cancelled, { bold: true, big: true })
    if (sale.replacedByInvoice)
      center(`${x.replacedBy}: ${sale.replacedByInvoice}`)
  }
  if (sale.replacesInvoice) center(`${x.replaces}: ${sale.replacesInvoice}`)
  row(`${t.invoice}:`, sale.invoiceNumber)
  row(`${t.date}:`, formatDateTime(sale.createdAt))
  divider()

  // Items
  row(t.item, t.amount, { bold: true })
  const itemRows = (list) => {
    for (const item of list) {
      blocks.push({
        kind: 'text',
        text: `${item.productName}${sizeText(item.size)}`,
      })
      row(
        `${formatQuantity(item.quantity, item.unit)} x ${money(item.unitPricePaise)}`,
        money(item.grossPaise),
        { indent: true },
      )
      if (item.lineDiscountPaise > 0) {
        row(t.itemDiscount, `-${money(item.lineDiscountPaise)}`, {
          indent: true,
        })
      }
    }
  }

  const groups = groupReceiptItems(sale, items)
  if (groups.grouped) {
    // The items that took the discount, with their subtotal, the discount and what is left...
    itemRows(groups.withDiscount)
    divider()
    row(
      `${t.subtotal} (${groups.withDiscountCount})`,
      money(groups.subtotalPaise),
    )
    row(t.discount, `-${money(groups.billDiscountPaise)}`)
    row(t.afterDiscount, money(groups.afterDiscountPaise), { bold: true })
    // ...then the items without a discount.
    if (groups.withoutDiscount.length > 0) {
      divider()
      itemRows(groups.withoutDiscount)
    }
    if (sale.taxAddedPaise > 0 || sale.roundOffPaise !== 0) divider()
  } else {
    itemRows(items)
    divider()
    row(`${t.subtotal} (${sale.itemCount})`, money(sale.subtotalPaise))
    if (sale.discountPaise > 0) row(t.discount, `-${money(sale.discountPaise)}`)
  }

  // Totals
  if (sale.taxAddedPaise > 0) row(t.taxAdded, money(sale.taxAddedPaise))
  if (sale.roundOffPaise !== 0) row(t.roundOff, signed(sale.roundOffPaise))
  divider('double')
  row(t.total, money(sale.totalPaise), { bold: true, big: true })
  divider('double')

  // GST in the bill: one row per tax rate, for example "GST 5%  61.33".
  const gst = gstByRate(items)
  if (gst.length > 0) {
    for (const [rate, tax] of gst) row(`${t.gst} ${rate}%`, money(tax))
  } else if ((sale.taxPaise ?? 0) > 0) {
    row(t.gst, money(sale.taxPaise))
  }

  // Footer
  blocks.push({ kind: 'spacer' })
  center(shop.footer || t.thanks)

  return { paperWidth, language, textSize, blocks }
}

// Both forms of the same receipt: `lines`/`text` (fixed-width, for a simple printer
// or the simulator) and `document` (for the Windows printer and the preview).
export function buildFullReceipt(sale, items, options = {}) {
  return {
    ...buildReceipt(sale, items, options),
    document: buildReceiptDocument(sale, items, options),
  }
}
