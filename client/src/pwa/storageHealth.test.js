import {
  formatBytes,
  getStorageHealth,
  requestPersistence,
  storageWarning,
} from './storageHealth'

const storageWith = (over = {}) => ({
  estimate: async () => ({ usage: 5_000_000, quota: 100_000_000 }),
  persisted: async () => true,
  persist: async () => true,
  ...over,
})

test('reports usage and whether storage is protected', async () => {
  const health = await getStorageHealth(storageWith())
  expect(health).toEqual({
    supported: true,
    persisted: true,
    usageBytes: 5_000_000,
    quotaBytes: 100_000_000,
    percentUsed: 5,
  })
})

test('copes with browsers that give no storage information', async () => {
  const health = await getStorageHealth(null)
  expect(health.supported).toBe(false)
  expect(storageWarning(health)).toContain('does not report')
})

test('asks the browser to protect storage', async () => {
  expect(await requestPersistence(storageWith())).toBe(true)
  expect(
    await requestPersistence(storageWith({ persist: async () => false })),
  ).toBe(false)
  expect(await requestPersistence({})).toBe(false)
})

test('warns when storage is nearly full or not protected, and formats sizes', () => {
  const base = {
    supported: true,
    persisted: true,
    usageBytes: 0,
    quotaBytes: 100,
    percentUsed: 10,
  }
  expect(storageWarning({ ...base, percentUsed: 85 })).toContain('85%')
  expect(storageWarning({ ...base, persisted: false })).toContain('may clear')
  expect(storageWarning(base)).toBeNull()

  expect(formatBytes(500)).toBe('500 B')
  expect(formatBytes(1536)).toBe('1.5 KB')
  expect(formatBytes(5_000_000)).toBe('4.8 MB')
})
