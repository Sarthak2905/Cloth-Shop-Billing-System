import { db } from '../db/db'

// Products and stock changes are tracked with a cursor: "everything after this point
// has been sent". Items are tracked by a fingerprint of their catalogue fields.
const CURSOR_KEYS = {
  product: 'sync.productCursor',
  movement: 'sync.movementCursor',
}
const HASHES_KEY = 'sync.variantHashes'

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

export async function getVariantHashes() {
  return (await db.settings.get(HASHES_KEY))?.value ?? {}
}

export async function markVariantsSynced(ops) {
  if (ops.length === 0) return
  const hashes = { ...(await getVariantHashes()) }
  for (const op of ops) hashes[op.entityId] = op.fingerprint
  await db.settings.put({ key: HASHES_KEY, value: hashes })
}

export async function forgetVariantHash(variantId) {
  const hashes = { ...(await getVariantHashes()) }
  delete hashes[variantId]
  await db.settings.put({ key: HASHES_KEY, value: hashes })
}
