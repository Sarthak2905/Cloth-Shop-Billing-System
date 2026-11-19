import { db } from '../db/db'
import { getSettings } from '../db/settingsRepo'
import { takeBarcodes } from '../db/variantRepo'
import {
  getCursor,
  getProductHashes,
  getPullState,
  getVariantHashes,
  markProductsSynced,
  markVariantsSynced,
  savePullState,
} from './cursors'
import { productOp, variantOp } from './ops'

// Downloading: brings what the server has onto this device, page by page. It always runs
// AFTER sending, so nothing waiting on this device is lost. A row that was changed here and
// not sent yet is never overwritten. Everything that comes down is marked as "already on
// the server", so it is never sent back.

const OVERLAP_MS = 30_000 // a row saved a moment late is still caught: rows are re-read for 30 s
const KINDS = ['products', 'variants', 'movements', 'sales']
const CODE = /^([A-Za-z]+)(\d{1,9})$/

// Where the next download starts: 30 seconds before the last row it has, from the start of
// that millisecond ('!' sorts before every id).
export function overlapCursor(cursor) {
  if (!cursor) return undefined
  const at = String(cursor).indexOf('|')
  const time = Date.parse(String(cursor).slice(0, Math.max(at, 0)))
  if (at < 1 || Number.isNaN(time)) return undefined
  return `${new Date(time - OVERLAP_MS).toISOString()}|!`
}

// "INV-000012" -> { prefix: 'INV', sequence: 12 }. A number made by the server ("INV-S000003") has none.
export function parseInvoice(invoiceNumber) {
  const match = /^([A-Z0-9]{1,6})-(\d{1,9})$/.exec(String(invoiceNumber ?? ''))
  return match ? { prefix: match[1], sequence: Number(match[2]) } : null
}

export async function pullIsDue(intervalMs, now = Date.now()) {
  const { lastPullAt } = await getPullState()
  if (!lastPullAt) return true
  return now - Date.parse(lastPullAt) >= intervalMs
}

// ---- The server's rows, as this device stores them ----------------------------------------

export const toLocalProduct = (p) => ({
  id: p.id,
  name: p.name,
  category: p.category ?? '',
  brand: p.brand ?? '',
  supplier: p.supplier ?? '',
  discountAllowed: p.discountAllowed !== false,
  status: p.status,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
})

export const toLocalVariant = (v, currentStock) => ({
  id: v.id,
  productId: v.productId,
  sku: v.sku ?? '',
  barcode: v.barcode,
  size: v.size ?? '',
  unit: v.unit ?? 'piece',
  ...(v.packSize ? { packSize: v.packSize } : {}),
  costPaise: v.costPaise ?? 0,
  mrpPaise: v.mrpPaise,
  sellingPricePaise: v.sellingPricePaise,
  taxRatePercent: v.taxRatePercent ?? 0,
  priceIncludesTax: v.priceIncludesTax !== false,
  reorderThreshold: v.reorderThreshold ?? 0,
  currentStock,
  status: v.status,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
})

// The time a stock change really happened is when it was made, not when the server got it.
export const toLocalMovement = (m) => ({
  id: m.id,
  variantId: m.variantId,
  type: m.type,
  quantityChange: m.quantityChange,
  stockAfter: m.stockAfter,
  reason: m.reason ?? '',
  referenceId: m.referenceId ?? null,
  createdAt: m.occurredAt ?? m.createdAt,
  synced: 1,
})

export function toLocalSale(s, syncedAt) {
  return {
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    invoiceSequence: parseInvoice(s.invoiceNumber)?.sequence ?? null,
    status: s.status,
    syncStatus: 'synced',
    syncedAt,
    syncFlags: (s.flags ?? []).map((flag) => flag.code),
    syncMessage: '',
    createdAt: s.soldAt, // when the bill was made
    shop: s.shop,
    itemCount: s.itemCount,
    subtotalPaise: s.subtotalPaise,
    itemDiscountPaise: s.itemDiscountPaise,
    billDiscountPaise: s.billDiscountPaise,
    discountPaise: s.discountPaise,
    billDiscount: s.billDiscount ?? null,
    taxableValuePaise: s.taxableValuePaise,
    taxPaise: s.taxPaise,
    taxIncludedPaise: s.taxIncludedPaise,
    taxAddedPaise: s.taxAddedPaise,
    exactTotalPaise: s.exactTotalPaise,
    roundOffPaise: s.roundOffPaise,
    totalPaise: s.totalPaise,
    payment: s.payment,
    payments: s.payments ?? [],
    paymentStatus: s.paymentStatus ?? 'paid',
    receivedPaise: s.receivedPaise ?? 0,
    shortPaise: s.shortPaise ?? 0,
    paymentRecordedAt: s.paymentRecordedAt ?? null,
    paymentRev: s.paymentRev ?? 0,
    cancelledAt: s.cancelledAt ?? null,
    cancelReason: s.cancelReason ?? '',
    replacedBySaleId: s.replacedBySaleId ?? null,
    replacedByInvoice: s.replacedByInvoice ?? '',
    replacesSaleId: s.replacesSaleId ?? null,
    replacesInvoice: s.replacesInvoice ?? '',
  }
}

// The same bill always gets the same item ids, so a bill that comes again replaces its items.
export const toLocalSaleItems = (s) =>
  (s.items ?? []).map((item) => ({
    id: `${s.id}:${item.lineNumber}`,
    saleId: s.id,
    ...item,
  }))

// ---- What this device has not sent yet -------------------------------------------------------

const isUnsentMovement = (m, cursor) =>
  !m.synced && (m.rejected === 1 || `${m.createdAt}|${m.id}` > cursor)

// For each item: the stock change that this device made but the server does not know about
// (bills waiting to be sent, bills the server refused, stock changes waiting or refused).
async function unsentStockChanges(variantIds) {
  const wanted = new Set(variantIds)
  const changes = new Map()
  const add = (id, n) => {
    if (wanted.has(id)) changes.set(id, (changes.get(id) ?? 0) + n)
  }

  const sales = await db.sales
    .where('syncStatus')
    .anyOf('pending', 'review')
    .toArray()
  for (const sale of sales) {
    const items = await db.saleItems.where('saleId').equals(sale.id).toArray()
    for (const item of items) add(item.variantId, -item.quantity)
  }

  const cursor = await getCursor('movement')
  for (const id of variantIds) {
    const movements = await db.stockMovements
      .where('variantId')
      .equals(id)
      .toArray()
    for (const m of movements) {
      if (m.type !== 'sale' && isUnsentMovement(m, cursor))
        add(id, m.quantityChange)
    }
  }
  return changes
}

// ---- Applying one page of each kind ---------------------------------------------------------

async function applyProducts(items) {
  const result = { skipped: 0, conflicts: [] }
  await db.transaction('rw', db.products, db.settings, async () => {
    await markProductsSynced([]) // starts the fingerprint list when it is not there yet
    const hashes = await getProductHashes()
    const synced = []
    for (const raw of items) {
      const existing = await db.products.get(raw.id)
      // changed here and not sent yet: this device's version wins, and is sent next
      if (existing && hashes[raw.id] !== productOp(existing).fingerprint) {
        result.skipped += 1
        continue
      }
      const local = toLocalProduct(raw)
      await db.products.put(local)
      synced.push(productOp(local))
    }
    await markProductsSynced(synced)
  })
  return result
}

async function applyVariants(items) {
  const result = { skipped: 0, conflicts: [], stockChanged: 0, barcodes: [] }
  await db.transaction(
    'rw',
    db.variants,
    db.sales,
    db.saleItems,
    db.stockMovements,
    db.settings,
    async () => {
      const hashes = await getVariantHashes()
      const unsent = await unsentStockChanges(items.map((v) => v.id))
      const synced = []
      for (const raw of items) {
        const existing = await db.variants.get(raw.id)
        if (existing && hashes[raw.id] !== variantOp(existing).fingerprint) {
          result.skipped += 1
          continue
        }
        const taken = await db.variants
          .where('barcode')
          .equals(raw.barcode)
          .first()
        if (taken && taken.id !== raw.id) {
          result.conflicts.push(
            `Barcode ${raw.barcode} is used by a different item on this device`,
          )
          continue
        }
        // the server's stock, plus what this device has done and not sent yet
        const stock = raw.currentStock + (unsent.get(raw.id) ?? 0)
        if (existing && existing.currentStock !== stock)
          result.stockChanged += 1
        const local = toLocalVariant(raw, stock)
        await db.variants.put(local)
        synced.push(variantOp(local))
        result.barcodes.push(local.barcode)
      }
      await markVariantsSynced(synced)
    },
  )
  return result
}

async function applyMovements(items) {
  await db.transaction('rw', db.stockMovements, async () => {
    await db.stockMovements.bulkPut(items.map(toLocalMovement))
  })
  return { skipped: 0, conflicts: [] }
}

async function applySales(items) {
  const result = { skipped: 0, conflicts: [] }
  await db.transaction('rw', db.sales, db.saleItems, db.settings, async () => {
    const settings = await getSettings()
    const syncedAt = new Date().toISOString()
    let highest = 0
    for (const raw of items) {
      const existing = await db.sales.get(raw.id)
      // something about this bill is still waiting to be sent: this device's version wins
      if (
        existing &&
        (existing.syncStatus !== 'synced' ||
          existing.paymentPending ||
          existing.cancelPending)
      ) {
        result.skipped += 1
        continue
      }
      const clash = await db.sales
        .where('invoiceNumber')
        .equals(raw.invoiceNumber)
        .first()
      if (clash && clash.id !== raw.id) {
        result.conflicts.push(
          `Invoice ${raw.invoiceNumber} is used by a different bill on this device`,
        )
        continue
      }
      await db.sales.put(toLocalSale(raw, syncedAt))
      await db.saleItems.where('saleId').equals(raw.id).delete()
      await db.saleItems.bulkAdd(toLocalSaleItems(raw))

      const invoice = parseInvoice(raw.invoiceNumber)
      if (invoice && invoice.prefix === settings.invoicePrefix) {
        highest = Math.max(highest, invoice.sequence)
      }
    }
    // the next bill made on this device continues after the highest number that came down
    if (highest > 0) {
      const counter = (await db.settings.get('invoiceCounter'))?.value ?? 0
      if (highest > counter)
        await db.settings.put({ key: 'invoiceCounter', value: highest })
    }
  })
  return result
}

const APPLY = {
  products: applyProducts,
  variants: applyVariants,
  movements: applyMovements,
  sales: applySales,
}

// New automatic barcodes must go past the highest one that came down. The counter lives with
// the barcode maker, so it is moved by asking it for numbers.
async function raiseBarcodeCounter(state, barcodes) {
  const highestByPrefix = new Map()
  let top = 0
  for (const code of barcodes) {
    const match = CODE.exec(code)
    if (!match) continue
    const n = Number(match[2])
    highestByPrefix.set(
      match[1],
      Math.max(highestByPrefix.get(match[1]) ?? 0, n),
    )
    top = Math.max(top, n)
  }
  if (top <= state.barcodeRaisedTo) return

  await db.transaction(
    'rw',
    db.settings,
    db.variants,
    db.products,
    db.stockMovements,
    async () => {
      const [probe] = await takeBarcodes(1)
      const match = CODE.exec(probe ?? '')
      if (match) {
        const target = highestByPrefix.get(match[1]) ?? 0
        const current = Number(match[2])
        if (target > current) await takeBarcodes(target - current)
      }
    },
  )
  state.barcodeRaisedTo = top
}

// Downloads everything that changed on the server since the last time. Safe to repeat.
// api.pullPage(kind, { after, limit }) -> { items, cursor, hasMore }
export async function pullAll({
  api,
  onProgress = () => {},
  pageLimit,
  now = () => Date.now(),
}) {
  const state = await getPullState()
  const summary = {
    products: 0,
    variants: 0,
    movements: 0,
    sales: 0,
    skipped: 0,
    stockChanged: 0,
    conflicts: [],
  }

  let totals = null
  try {
    totals = (await api.pullSummary?.())?.counts ?? null
  } catch {
    // the totals are only for the progress display
  }

  const barcodes = []
  for (const kind of KINDS) {
    let after = overlapCursor(state.cursors[kind])
    for (;;) {
      const page = await api.pullPage(kind, { after, limit: pageLimit })
      const result = await APPLY[kind](page.items)

      summary[kind] += page.items.length
      summary.skipped += result.skipped
      summary.stockChanged += result.stockChanged ?? 0
      summary.conflicts.push(...result.conflicts)
      if (result.barcodes) barcodes.push(...result.barcodes)

      // where to continue is saved after every page: a dropped connection loses nothing
      state.cursors[kind] = page.cursor ?? state.cursors[kind] ?? null
      await savePullState(state)
      onProgress({ kind, done: summary[kind], total: totals?.[kind] ?? null })

      if (!page.hasMore) break
      after = page.cursor
    }
    if (kind === 'variants') {
      await raiseBarcodeCounter(state, barcodes)
      await savePullState(state)
    }
  }

  state.lastPullAt = new Date(now()).toISOString()
  await savePullState(state)
  await db.settings.put({
    key: 'sync.lastPullResult',
    value: {
      at: state.lastPullAt,
      ...summary,
      conflicts: summary.conflicts.slice(0, 20),
    },
  })
  return summary
}
