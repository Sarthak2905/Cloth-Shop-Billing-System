import { vi } from 'vitest'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { newId } from '../lib/id'
import {
  BACKUP_TABLES,
  backupFileName,
  backupToJson,
  compareWithDevice,
  computeChecksum,
  exportBackup,
  getBackupStatus,
  recordBackup,
  restoreBackup,
  validateBackup,
} from './backupService'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Makes sure sample data exists, then sells one item.
async function sell() {
  await seedSampleData()
  const variant = (await db.variants.toArray())[0]
  const product = await db.products.get(variant.productId)
  const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
  const { sale } = await createSale({
    id: newId(),
    cart,
    payment: { method: 'cash' },
  })
  return sale
}

// What a backup looks like after it was saved to a file and opened again.
async function fileOf() {
  return JSON.parse(backupToJson(await exportBackup()))
}

const withChecksum = (backup) => ({
  ...backup,
  checksum: computeChecksum(backup.tables),
})

async function snapshotCounts() {
  return {
    products: await db.products.count(),
    variants: await db.variants.count(),
    sales: await db.sales.count(),
    saleItems: await db.saleItems.count(),
    movements: await db.stockMovements.count(),
  }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('the backup covers every table in the database', () => {
  const tableNames = db.tables.map((t) => t.name).sort()
  expect([...BACKUP_TABLES].sort()).toEqual(tableNames)
})

test('exports all data with counts and a checksum', async () => {
  await sell()
  const backup = await exportBackup()

  expect(backup.format).toBe('clothing-pos-backup')
  expect(backup.version).toBe(1)
  expect(backup.counts.products).toBe(3)
  expect(backup.counts.variants).toBe(9)
  expect(backup.counts.sales).toBe(1)
  expect(backup.counts.saleItems).toBe(1)
  expect(backup.checksum).toMatch(/^[0-9a-f]{8}$/)
  expect(backup.tables.sales).toHaveLength(1)
})

test('a backup survives being saved as JSON and validates', async () => {
  await sell()
  const check = validateBackup(await fileOf())

  expect(check.ok).toBe(true)
  expect(check.summary.counts.sales).toBe(1)
  expect(check.summary.counts.products).toBe(3)
})

test('rejects files that are not backups, or are from another version', async () => {
  await sell()
  for (const bad of [null, 'text', [], {}, { format: 'other' }]) {
    expect(validateBackup(bad).ok).toBe(false)
  }

  const file = await fileOf()
  expect(validateBackup({ ...file, version: 99 }).error).toContain(
    'newer version',
  )
  expect(validateBackup({ ...file, version: 0 }).error).toContain(
    'not supported',
  )
})

test('detects a damaged or edited file', async () => {
  await sell()
  const file = await fileOf()
  file.tables.products[0].name = 'Tampered'

  const check = validateBackup(file)
  expect(check.ok).toBe(false)
  expect(check.error).toContain('damaged')
})

test('detects missing tables, entries without ids and duplicates', async () => {
  await sell()

  const missing = await fileOf()
  delete missing.tables.settings
  expect(validateBackup(withChecksum(missing)).error).toContain('settings')

  const noId = await fileOf()
  noId.tables.products[0] = { name: 'No id' }
  expect(validateBackup(withChecksum(noId)).error).toContain('products')

  const duplicate = await fileOf()
  duplicate.tables.products.push({ ...duplicate.tables.products[0] })
  expect(validateBackup(withChecksum(duplicate)).error).toContain('duplicate')
})

test('detects records that refer to things missing from the file', async () => {
  await sell()

  const noProduct = await fileOf()
  noProduct.tables.products = noProduct.tables.products.slice(1)
  expect(validateBackup(withChecksum(noProduct)).error).toContain('variants')

  const noSales = await fileOf()
  noSales.tables.sales = []
  expect(validateBackup(withChecksum(noSales)).error).toContain('sale items')
})

test('restore replaces everything and brings back the invoice counter', async () => {
  await sell() // INV-000001
  const file = await fileOf()
  await sell() // INV-000002
  expect(await db.sales.count()).toBe(2)

  await restoreBackup(file)

  expect(await db.sales.count()).toBe(1)
  const next = await sell()
  expect(next.invoiceNumber).toBe('INV-000002')
  expect(await db.sales.count()).toBe(2)
})

test('restore works on an empty device (a new phone or laptop)', async () => {
  await sell()
  const file = await fileOf()
  await Promise.all(db.tables.map((t) => t.clear()))
  expect(await db.products.count()).toBe(0)

  const summary = await restoreBackup(file)

  expect(summary.counts.sales).toBe(1)
  expect(await db.products.count()).toBe(3)
  expect(await db.variants.count()).toBe(9)
  expect((await db.settings.get('lastBackupAt')).value).toBe(file.createdAt)
})

test('a restore that fails halfway changes nothing', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await sell()
  const before = await snapshotCounts()

  // Valid on the surface, but two variants share a barcode, which the database refuses.
  const file = await fileOf()
  const first = file.tables.variants[0]
  file.tables.variants.push({
    ...first,
    id: 'dup-variant',
    sku: 'DUP-SKU',
    size: 'ZZ',
  })

  await expect(restoreBackup(withChecksum(file))).rejects.toMatchObject({
    code: 'RESTORE_FAILED',
  })
  expect(await snapshotCounts()).toEqual(before)
})

test('refuses to restore an invalid backup and changes nothing', async () => {
  await sell()
  const file = await fileOf()
  file.tables.products[0].name = 'Tampered'

  await expect(restoreBackup(file)).rejects.toMatchObject({
    code: 'INVALID_BACKUP',
  })
  expect(await db.products.count()).toBe(3)
  expect(await db.sales.count()).toBe(1)
})

test('backup status moves from empty to never to ok to stale', async () => {
  expect((await getBackupStatus()).level).toBe('empty')

  await seedSampleData()
  expect((await getBackupStatus()).level).toBe('never')

  await recordBackup(new Date())
  const fresh = await getBackupStatus()
  expect(fresh.level).toBe('ok')
  expect(fresh.salesSince).toBe(0)

  await sell()
  expect((await getBackupStatus()).salesSince).toBe(1)

  await recordBackup(new Date(Date.now() - 30 * 3_600_000))
  const stale = await getBackupStatus()
  expect(stale.level).toBe('stale')
  expect(stale.hoursSince).toBeGreaterThanOrEqual(30)
  expect(stale.salesSince).toBe(1)
})

test('compareWithDevice counts sales made after the backup', async () => {
  await sell()
  const file = await fileOf()
  await wait(5)
  await sell()

  const comparison = await compareWithDevice(file)
  expect(comparison.salesNewerThanBackup).toBe(1)
  expect(comparison.deviceCounts.sales).toBe(2)
  expect(comparison.hasData).toBe(true)
})

test('backup file names use the local date and time', () => {
  expect(backupFileName(new Date(2026, 9, 30, 17, 5))).toBe(
    'clothing-pos-backup-2026-10-30-1705.json',
  )
  expect(backupFileName(new Date(2026, 0, 2, 3, 4), 'before-restore')).toBe(
    'before-restore-2026-01-02-0304.json',
  )
})
