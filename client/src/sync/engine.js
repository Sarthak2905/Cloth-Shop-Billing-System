import { db } from '../db/db'
import { AuthError, NetworkError } from './apiClient'
import { clearAttention, recordAttention } from './attention'
import { chunk, collectPending, countPending } from './collect'
import { markVariantsSynced, setCursor } from './cursors'
import { toRequestOp } from './ops'

const BATCH_SIZE = 20

let running = null

// Sends everything that is waiting. Only one run happens at a time: a second call
// while one is running simply waits for, and returns, the same run.
//
// outcome: 'ok' | 'offline' | 'auth' | 'server-error'
export function runSync(options) {
  if (running) return running
  running = doSync(options).finally(() => {
    running = null
  })
  return running
}

async function doSync({ api, batchSize = BATCH_SIZE }) {
  const summary = {
    outcome: 'ok',
    sent: 0,
    applied: 0,
    duplicate: 0,
    rejected: 0,
    error: 0,
    remaining: 0,
    message: '',
  }

  const ops = await collectPending()

  for (const batch of chunk(ops, batchSize)) {
    let response
    try {
      response = await api.push(batch.map(toRequestOp))
    } catch (err) {
      if (err instanceof NetworkError) {
        summary.outcome = 'offline'
        summary.message = err.message
      } else if (err instanceof AuthError) {
        summary.outcome = 'auth'
        summary.message = 'Your sign-in is no longer valid.'
      } else {
        summary.outcome = 'server-error'
        summary.message = err?.message ?? 'The server returned an error.'
      }
      break
    }

    const results = response?.results
    if (!Array.isArray(results) || results.length !== batch.length) {
      summary.outcome = 'server-error'
      summary.message = 'The server sent an unexpected answer.'
      break
    }

    summary.sent += batch.length
    const temporary = await applyBatchResults(batch, results, summary)
    if (temporary) {
      summary.outcome = 'server-error'
      summary.message =
        'The server had a temporary problem. It will be tried again.'
      break
    }
  }

  summary.remaining = (await countPending()).total
  await saveLastRun(summary)
  return summary
}

// True when the payment on the device is still the one that was sent. If it was changed
// while the operation was on its way, it stays waiting and is sent again.
async function paymentIsCurrent(saleId, sentRev) {
  const current = await db.sales.get(saleId)
  return (current?.paymentRev ?? 0) === (sentRev ?? 0)
}

// Records what the server said about each operation. Returns true if any of them
// hit a temporary error (those are tried again later).
async function applyBatchResults(batch, results, summary) {
  let temporary = false

  for (let i = 0; i < batch.length; i += 1) {
    const op = batch[i]
    const result = results[i]

    if (result?.status === 'applied' || result?.status === 'duplicate') {
      summary[result.status] += 1
      if (op.kind === 'sale') {
        const changes = {
          syncStatus: 'synced',
          syncedAt: new Date().toISOString(),
          syncFlags: result.flags ?? [],
          syncMessage: '',
        }
        // the bill carried its payment: nothing more to send, unless it changed meanwhile
        if (await paymentIsCurrent(op.entityId, op.paymentRev)) {
          changes.paymentPending = undefined
        }
        await db.sales.update(op.entityId, changes)
      } else if (op.kind === 'salepay') {
        if (await paymentIsCurrent(op.entityId, op.paymentRev)) {
          await db.sales.update(op.entityId, { paymentPending: undefined })
        }
      } else if (op.kind === 'salecancel') {
        await db.sales.update(op.entityId, { cancelPending: undefined })
      }
      await clearAttention(op)
    } else if (result?.status === 'rejected') {
      summary.rejected += 1
      await recordAttention(op, result)
      if (op.kind === 'sale') {
        await db.sales.update(op.entityId, {
          syncStatus: 'review',
          syncMessage: result.message ?? '',
        })
      } else if (op.kind === 'salepay') {
        await db.sales.update(op.entityId, { paymentPending: undefined })
      } else if (op.kind === 'salecancel') {
        await db.sales.update(op.entityId, { cancelPending: undefined })
      }
    } else {
      summary.error += 1
      temporary = true
    }
  }

  // Only move forward when the whole batch is settled. Otherwise the batch is sent
  // again next time, which is safe because the server ignores what it already has.
  if (!temporary) await advance(batch)
  return temporary
}

async function advance(batch) {
  const lastKey = {}
  for (const op of batch) {
    if (op.kind === 'product' || op.kind === 'movement')
      lastKey[op.kind] = op.key
  }
  for (const [kind, key] of Object.entries(lastKey)) await setCursor(kind, key)
  await markVariantsSynced(batch.filter((op) => op.kind === 'variant'))
}

async function saveLastRun(summary) {
  const at = new Date().toISOString()
  await db.settings.put({
    key: 'sync.lastRun',
    value: {
      at,
      outcome: summary.outcome,
      message: summary.message,
      applied: summary.applied,
      duplicate: summary.duplicate,
      rejected: summary.rejected,
      remaining: summary.remaining,
    },
  })
  if (summary.outcome === 'ok' && summary.sent > 0) {
    await db.settings.put({ key: 'sync.lastSuccessAt', value: at })
  }
}
