import { db } from '../db/db.js'
import { AppError } from '../lib/errors.js'
import { isStorageFull } from '../lib/storageErrors.js'

export const BACKUP_FORMAT = 'clothing-pos-backup'
export const BACKUP_VERSION = 1
export const BACKUP_MAX_AGE_HOURS = 24

// Every database table must be listed here. A test checks this list against
// the real database, so a future table cannot be forgotten.
export const BACKUP_TABLES = [
  'products',
  'variants',
  'sales',
  'saleItems',
  'stockMovements',
  'settings',
  'syncQueue',
  'printJobs',
]

// ---- Integrity check -------------------------------------------------------
// A checksum catches truncated, damaged or edited files. It is NOT security.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(text) {
  let c = 0xffffffff
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i)
    c = CRC_TABLE[(c ^ (unit & 0xff)) & 0xff] ^ (c >>> 8)
    c = CRC_TABLE[(c ^ (unit >>> 8)) & 0xff] ^ (c >>> 8)
  }
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0')
}

export function computeChecksum(tables) {
  return crc32(JSON.stringify(tables))
}

function countRows(tables) {
  return Object.fromEntries(
    BACKUP_TABLES.map((name) => [name, tables[name]?.length ?? 0]),
  )
}

// ---- Export ----------------------------------------------------------------

export async function exportBackup() {
  const tables = {}
  // One read transaction, so every table comes from the same moment.
  await db.transaction('r', db.tables, async () => {
    for (const name of BACKUP_TABLES)
      tables[name] = await db.table(name).toArray()
  })

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appDbVersion: db.verno,
    counts: countRows(tables),
    checksum: computeChecksum(tables),
    tables,
  }
}

export function backupToJson(backup) {
  return JSON.stringify(backup)
}

export function backupFileName(
  date = new Date(),
  prefix = 'clothing-pos-backup',
) {
  const pad = (n) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${prefix}-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.json`
}

// ---- Validation ------------------------------------------------------------

// Checks a parsed file WITHOUT touching the database.
// Returns { ok: true, summary } or { ok: false, error }.
export function validateBackup(parsed) {
  const fail = (error) => ({ ok: false, error })

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.format !== BACKUP_FORMAT
  ) {
    return fail('This file is not a Clothing POS backup.')
  }
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    return fail(
      'This backup was made by a newer version of the app. Update the app first.',
    )
  }
  if (parsed.version !== BACKUP_VERSION) {
    return fail('This backup version is not supported.')
  }

  const tables = parsed.tables
  if (!tables || typeof tables !== 'object')
    return fail('The backup has no data in it.')

  for (const name of BACKUP_TABLES) {
    if (!Array.isArray(tables[name]))
      return fail(`The backup is missing the "${name}" data.`)

    const keyField = name === 'settings' ? 'key' : 'id'
    const seen = new Set()
    for (const row of tables[name]) {
      const valid =
        row &&
        typeof row === 'object' &&
        !Array.isArray(row) &&
        row[keyField] !== undefined &&
        row[keyField] !== null &&
        row[keyField] !== ''
      if (!valid)
        return fail(`The "${name}" data has an entry without an ${keyField}.`)
      if (seen.has(row[keyField]))
        return fail(`The "${name}" data has duplicate entries.`)
      seen.add(row[keyField])
    }
  }

  if (parsed.checksum !== computeChecksum(tables)) {
    return fail(
      'The backup file is damaged or was edited (its checksum does not match). Do not use it.',
    )
  }

  const idsOf = (name) => new Set(tables[name].map((row) => row.id))
  const productIds = idsOf('products')
  const saleIds = idsOf('sales')
  const variantIds = idsOf('variants')

  if (tables.variants.some((v) => !productIds.has(v.productId))) {
    return fail(
      'The backup is inconsistent: some variants refer to products that are not in it.',
    )
  }
  if (tables.saleItems.some((item) => !saleIds.has(item.saleId))) {
    return fail(
      'The backup is inconsistent: some sale items refer to sales that are not in it.',
    )
  }
  if (tables.stockMovements.some((m) => !variantIds.has(m.variantId))) {
    return fail(
      'The backup is inconsistent: some stock records refer to variants that are not in it.',
    )
  }

  return {
    ok: true,
    summary: { createdAt: parsed.createdAt, counts: countRows(tables) },
  }
}

// ---- Restore ---------------------------------------------------------------

// How the device looks right now, compared with a (valid) backup file.
export async function compareWithDevice(parsed) {
  const deviceCounts = {
    products: await db.products.count(),
    variants: await db.variants.count(),
    sales: await db.sales.count(),
  }
  const salesNewerThanBackup = await db.sales
    .where('createdAt')
    .above(parsed.createdAt)
    .count()
  return {
    deviceCounts,
    salesNewerThanBackup,
    hasData: deviceCounts.products + deviceCounts.sales > 0,
  }
}

// Replaces ALL data on this device with the backup. All or nothing.
export async function restoreBackup(parsed) {
  const check = validateBackup(parsed)
  if (!check.ok) throw new AppError('INVALID_BACKUP', check.error)

  try {
    await db.transaction('rw', db.tables, async () => {
      for (const name of BACKUP_TABLES) await db.table(name).clear()
      for (const name of BACKUP_TABLES) {
        if (parsed.tables[name].length > 0)
          await db.table(name).bulkAdd(parsed.tables[name])
      }
      // The data is now exactly as it was in the file, so that is the "last backup".
      await db.settings.put({ key: 'lastBackupAt', value: parsed.createdAt })
    })
  } catch (err) {
    console.error('Restore failed', err)
    throw new AppError(
      'RESTORE_FAILED',
      isStorageFull(err)
        ? 'This device does not have enough storage space to restore. Nothing was changed.'
        : 'The backup could not be restored. Nothing on this device was changed.',
    )
  }
  return check.summary
}

// ---- Backup status ---------------------------------------------------------

export async function recordBackup(date = new Date()) {
  await db.settings.put({ key: 'lastBackupAt', value: date.toISOString() })
}

// level: 'empty' (nothing to lose) | 'never' | 'stale' | 'ok'
export async function getBackupStatus(now = new Date()) {
  const products = await db.products.count()
  const sales = await db.sales.count()
  const row = await db.settings.get('lastBackupAt')
  const lastBackupAt = row?.value ?? null

  const hasData = products > 0 || sales > 0
  const salesSince = lastBackupAt
    ? await db.sales.where('createdAt').above(lastBackupAt).count()
    : sales
  const hoursSince = lastBackupAt
    ? Math.floor((now.getTime() - new Date(lastBackupAt).getTime()) / 3_600_000)
    : null

  let level = 'ok'
  if (!hasData) level = 'empty'
  else if (!lastBackupAt) level = 'never'
  else if (hoursSince >= BACKUP_MAX_AGE_HOURS) level = 'stale'

  return { level, lastBackupAt, hoursSince, salesSince, products, sales }
}

// ---- Files (browser only) --------------------------------------------------

export function saveTextFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Opens the phone's share sheet. Returns false when sharing files is not supported.
export async function shareTextFile(filename, text) {
  const file = new File([text], filename, { type: 'text/plain' })
  if (!navigator.canShare?.({ files: [file] })) return false
  await navigator.share({ files: [file], title: 'Clothing POS backup' })
  return true
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read the file'))
    reader.readAsText(file)
  })
}
