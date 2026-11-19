import { db } from '../db/db'
import { productOp } from './ops'

// Stock changes are tracked with a cursor ("everything after this point has been sent")
// and a `synced` mark on each row. Products and items are tracked by a fingerprint of
// their fields, so the time on this computer's clock does not matter.
const CURSOR_KEYS = {
  product: 'sync.productCursor', // only used by devices that synced before fingerprints
  movement: 'sync.movementCursor',
}
const VARIANT_HASHES_KEY = 'sync.variantHashes'
const PRODUCT_HASHES_KEY = 'sync.productHashes'
const PULL_KEY = 'sync.pull'

export async function getCursor(kind) {
  return (await db.settings.get(CURSOR_KEYS[kind]))?.value ?? ''
}

export async function setCursor(kind, value) {
  await db.settings.put({ key: CURSOR_KEYS[kind], value })
}

// Moves the cursor back so a rejected item is picked up again.
export async function rewindCursor(kind, entityTime) {
  const target = `${entityTime}|`
  const current = await getCursor(kind)
  if (target < current) await setCursor(kind, target)
}

// ---- Items ----------------------------------------------------------------------

export async function getVariantHashes() {
  return (await db.settings.get(VARIANT_HASHES_KEY))?.value ?? {}
}

export async function markVariantsSynced(ops) {
  if (ops.length === 0) return
  const hashes = { ...(await getVariantHashes()) }
  for (const op of ops) hashes[op.entityId] = op.fingerprint
  await db.settings.put({ key: VARIANT_HASHES_KEY, value: hashes })
}

export async function forgetVariantHash(variantId) {
  const hashes = { ...(await getVariantHashes()) }
  delete hashes[variantId]
  await db.settings.put({ key: VARIANT_HASHES_KEY, value: hashes })
}

// ---- Products -------------------------------------------------------------------

// null until the first product is marked. Until then the old cursor rule decides.
export async function getProductHashes() {
  return (await db.settings.get(PRODUCT_HASHES_KEY))?.value ?? null
}

// What the old cursor said had been sent, as fingerprints. Used once, to start the list.
async function legacyProductHashes() {
  const cursor = await getCursor('product')
  const hashes = {}
  if (!cursor) return hashes
  for (const product of await db.products.toArray()) {
    const op = productOp(product)
    if (op.key <= cursor) hashes[op.entityId] = op.fingerprint
  }
  return hashes
}

export async function markProductsSynced(ops) {
  const row = await db.settings.get(PRODUCT_HASHES_KEY)
  const hashes = row ? { ...row.value } : await legacyProductHashes()
  for (const op of ops) hashes[op.entityId] = op.fingerprint
  await db.settings.put({ key: PRODUCT_HASHES_KEY, value: hashes })
}

export async function forgetProductHash(productId) {
  const row = await db.settings.get(PRODUCT_HASHES_KEY)
  const hashes = row ? { ...row.value } : await legacyProductHashes()
  delete hashes[productId]
  await db.settings.put({ key: PRODUCT_HASHES_KEY, value: hashes })
}

// ---- Downloading ----------------------------------------------------------------

// cursors: where each kind of download continues. lastPullAt: when a download last finished.
// barcodeRaisedTo: the highest automatic barcode number that came down, so new ones go past it.
export async function getPullState() {
  const value = (await db.settings.get(PULL_KEY))?.value ?? {}
  return {
    cursors: { ...(value.cursors ?? {}) },
    lastPullAt: value.lastPullAt ?? null,
    barcodeRaisedTo: value.barcodeRaisedTo ?? 0,
  }
}

export async function savePullState(state) {
  await db.settings.put({ key: PULL_KEY, value: state })
}
