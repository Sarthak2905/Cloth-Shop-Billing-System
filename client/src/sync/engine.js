import { db } from '../db/db'
import { AuthError, NetworkError } from './apiClient'
import { clearAttention, recordAttention } from './attention'
import { chunk, collectPending, countPending } from './collect'
import { markProductsSynced, markVariantsSynced, setCursor } from './cursors'
import { toRequestOp } from './ops'
import { pullAll, pullIsDue } from './pull'

const BATCH_SIZE = 20
const PULL_EVERY_MS = 2 * 60 * 1000

let running = null

// Sends everything that is waiting, and then (with `pull`) downloads what changed on the
// server. Only one run happens at a time: a second call while one is running simply waits
// for, and returns, the same run.
//
// outcome: 'ok' | 'offline' | 'auth' | 'server-error'
export function runSync(options) {
  if (running) return running
  running = doSync(options).finally(() => {
    running = null
  })
  return running
}

function failure(err) {
  if (err instanceof NetworkError)
    return { outcome: 'offline', message: err.message }
  if (err instanceof AuthError) {
    return { outcome: 'auth', message: 'Your sign-in is no longer valid.' }
  }
  return {
    outcome: 'server-error',
    message: err?.message ?? 'The server returned an error.',
  }
}

async function doSync({
  api,
  batchSize = BATCH_SIZE,
  pull = false,
  forcePull = false,
  pullIntervalMs = PULL_EVERY_MS,
  onProgress,
}) {
  const summary = {
    outcome: 'ok',
    sent: 0,
    applied: 0,
    duplicate: 0,
    rejected: 0,
    error: 0,
    remaining: 0,
    message: '',
    pulled: null,
  }

  const ops = await collectPending()

  for (const batch of chunk(ops, batchSize)) {
    let response
    try {
      response = await api.push(batch.map(toRequestOp))
    } catch (err) {
      Object.assign(summary, failure(err))
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

  // Downloading comes only after everything was sent without trouble.
  if (pull && summary.outcome === 'ok' && typeof api.pullPage === 'function') {
    if (forcePull || (await pullIsDue(pullIntervalMs))) {
      try {
        summary.pulled = await pullAll({ api, onProgress })
      } catch (err) {
        Object.assign(summary, failure(err))
      }
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
  const acceptedMovements = []
  const refusedMovements = []

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
      } else if (op.kind === 'movement') {
        acceptedMovements.push(op.entityId)
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
      } else if (op.kind === 'movement') {
        refusedMovements.push(op.entityId)
      }
    } else {
      summary.error += 1
      temporary = true
    }
  }

  // Only move forward when the whole batch is settled. Otherwise the batch is sent
  // again next time, which is safe because the server ignores what it already has.
  if (!temporary) await advance(batch, acceptedMovements, refusedMovements)
  return temporary
}

async function advance(batch, acceptedMovements, refusedMovements) {
  const lastMovement = batch.filter((op) => op.kind === 'movement').at(-1)
  if (lastMovement) await setCursor('movement', lastMovement.key)

  // A stock change the server has is marked, so it is never sent again. One it refused is
  // not sent again either, but it is remembered as still only on this device.
  if (acceptedMovements.length > 0) {
    await db.stockMovements
      .where('id')
      .anyOf(acceptedMovements)
      .modify((m) => {
        m.synced = 1
        delete m.rejected
      })
  }
  if (refusedMovements.length > 0) {
    await db.stockMovements
      .where('id')
      .anyOf(refusedMovements)
      .modify({ rejected: 1 })
  }

  const products = batch.filter((op) => op.kind === 'product')
  if (products.length > 0) await markProductsSynced(products)
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
  if (summary.outcome === 'ok' && (summary.sent > 0 || summary.pulled)) {
    await db.settings.put({ key: 'sync.lastSuccessAt', value: at })
  }
}
