import { formatDateTime } from '../lib/format.js'
import { paiseToRupees } from '../lib/money.js'
import { centerText, divider, twoColumns, wrapText } from './textLayout.js'

// Characters per line for each paper width (typical Font A on thermal printers).
// '80-42' is 80 mm paper with 42 characters per line, which is what the Epson TM-T88III/IV
// prints in its normal font. '80' (48 characters) suits newer printers such as the TM-T88V.
export const PAPER_COLUMNS = { '58': 32, '80': 48, '80-42': 42 }

// The Marathi wording is a first draft. Please have it checked by someone fluent.
export const LABELS = {
  en: {
    invoice: 'Invoice',
    date: 'Date',
    item: 'Item',
    amount: 'Amount (Rs)',
    subtotal: 'Subtotal',
    discount: 'Discount',
    itemDiscount: 'Item discount',
    taxAdded: 'Tax added',
    roundOff: 'Round off',
    total: 'TOTAL',
    payment: 'Payment',
    received: 'Received',
    change: 'Change',
    reference: 'Ref',
    includesTax: 'Includes tax',
    duplicate: '*** DUPLICATE COPY ***',
    phone: 'Ph',
    gst: 'GST',
    taxId: 'GSTIN',
    thanks: 'Thank you! Visit again.',
    methods: { cash: 'Cash', upi: 'UPI', card: 'Card' },
  },
  mr: {
    invoice: 'बिल क्र.',
    date: 'दिनांक',
    item: 'तपशील',
    amount: 'रक्कम (रु)',
    subtotal: 'उप-एकूण',
    discount: 'सूट',
    itemDiscount: 'वस्तू सूट',
    taxAdded: 'कर (अधिक)',
    roundOff: 'पूर्णांक',
    total: 'एकूण',
    payment: 'भरणा',
    received: 'मिळालेले',
    change: 'परत',
    reference: 'संदर्भ',
    includesTax: 'एकूणात कर',
    duplicate: '*** दुय्यम प्रत ***',
    phone: 'फोन',
    gst: 'जीएसटी',
    taxId: 'GSTIN',
    thanks: 'धन्यवाद! पुन्हा भेट द्या.',
    methods: { cash: 'रोख', upi: 'UPI', card: 'कार्ड' },
  },
}

const money = (paise) => paiseToRupees(paise)
const signed = (paise) => `${paise < 0 ? '-' : '+'}${money(Math.abs(paise))}`

// Builds the exact lines a receipt printer should print.
// paperWidth: '58' | '80'. language: 'en' | 'mr'.
export function buildReceipt(
  sale,
  items,
  { paperWidth = '58', language = 'en', reprint = false } = {},
) {
  const paper = PAPER_COLUMNS[paperWidth] ? paperWidth : '58'
  const width = PAPER_COLUMNS[paper]
  const t = LABELS[language] ?? LABELS.en
  const shop = sale.shop ?? {}
  const lines = []

  const centered = (text) => {
    const value = String(text ?? '').trim()
    if (value) lines.push(...centerText(value, width))
  }

  // Header
  centered(shop.name)
  for (const part of String(shop.address ?? '').split('\n')) centered(part)
  if (shop.phone) centered(`${t.phone}: ${shop.phone}`)
  if (shop.taxId) centered(`${t.taxId}: ${shop.taxId}`)
  lines.push(divider(width))
  if (reprint) {
    centered(t.duplicate)
  }
  lines.push(...twoColumns(`${t.invoice}:`, sale.invoiceNumber, width))
  lines.push(...twoColumns(`${t.date}:`, formatDateTime(sale.createdAt), width))
  lines.push(divider(width))

  // Items
  lines.push(...twoColumns(t.item, t.amount, width))
  for (const item of items) {
    lines.push(...wrapText(`${item.productName} (${item.size})`, width))
    lines.push(
      ...twoColumns(
        `${item.quantity} x ${money(item.unitPricePaise)}`,
        money(item.grossPaise),
        width,
        2,
      ),
    )
    if (item.lineDiscountPaise > 0) {
      lines.push(
        ...twoColumns(
          t.itemDiscount,
          `-${money(item.lineDiscountPaise)}`,
          width,
          2,
        ),
      )
    }
  }
  lines.push(divider(width))

  // Totals
  lines.push(
    ...twoColumns(
      `${t.subtotal} (${sale.itemCount})`,
      money(sale.subtotalPaise),
      width,
    ),
  )
  if (sale.discountPaise > 0) {
    lines.push(
      ...twoColumns(t.discount, `-${money(sale.discountPaise)}`, width),
    )
  }
  if (sale.taxAddedPaise > 0) {
    lines.push(...twoColumns(t.taxAdded, money(sale.taxAddedPaise), width))
  }
  if (sale.roundOffPaise !== 0) {
    lines.push(...twoColumns(t.roundOff, signed(sale.roundOffPaise), width))
  }
  lines.push(divider(width, '='))
  lines.push(...twoColumns(t.total, money(sale.totalPaise), width))
  lines.push(divider(width, '='))

  // Payment
  const payment = sale.payment
  lines.push(
    ...twoColumns(
      `${t.payment}:`,
      t.methods[payment.method] ?? payment.method,
      width,
    ),
  )
  if (payment.method === 'cash') {
    lines.push(
      ...twoColumns(t.received, money(payment.amountTenderedPaise), width),
    )
    if (payment.changePaise > 0) {
      lines.push(...twoColumns(t.change, money(payment.changePaise), width))
    }
  }
  if (payment.reference) {
    lines.push(...wrapText(`${t.reference}: ${payment.reference}`, width))
  }
  if (sale.taxIncludedPaise > 0) {
    lines.push(
      ...twoColumns(t.includesTax, money(sale.taxIncludedPaise), width),
    )
  }

  // Footer
  lines.push('')
  centered(shop.footer || t.thanks)

  return {
    paperWidth: paper,
    width,
    language,
    lines,
    text: lines.join('\n'),
    cut: true, // a real printer cuts the paper after printing, if it can
  }
}
