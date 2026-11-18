import { db } from '../db/db'
import { forgetVariantHash, rewindCursor } from './cursors'

// The "needs attention" list: things the server refused for a reason that retrying
// will not fix. They are kept here, and are never deleted from the device.

export async function recordAttention(op, result) {
  const id = `${op.kind}:${op.entityId}`
  const existing = await db.syncQueue.get(id)
  const now = new Date().toISOString()
  await db.syncQueue.put({
    id,
    kind: op.kind,
    entityId: op.entityId,
    entityTime: op.entityTime,
    label: op.label,
    code: result.code ?? 'REJECTED',
    message: result.message ?? '',
    status: 'open',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })
}

export async function clearAttention(op) {
  await db.syncQueue.delete(`${op.kind}:${op.entityId}`)
}

export function listAttention() {
  return db.syncQueue.where('status').equals('open').sortBy('createdAt')
}

export async function dismissAttention(id) {
  await db.syncQueue.update(id, {
    status: 'dismissed',
    updatedAt: new Date().toISOString(),
  })
}

// Puts the item back in the queue, so the next sync sends it again.
export async function retryAttention(item) {
  if (item.kind === 'sale') {
    await db.sales.update(item.entityId, {
      syncStatus: 'pending',
      syncMessage: '',
    })
  } else if (item.kind === 'salepay') {
    await db.sales.update(item.entityId, { paymentPending: 1 })
  } else if (item.kind === 'salecancel') {
    await db.sales.update(item.entityId, { cancelPending: 1 })
  } else if (item.kind === 'variant') {
    await forgetVariantHash(item.entityId)
  } else {
    await rewindCursor(item.kind, item.entityTime)
  }
  await db.syncQueue.delete(item.id)
}

export async function retryAllAttention() {
  for (const item of await listAttention()) await retryAttention(item)
}
