const UNSUPPORTED = {
  supported: false,
  persisted: false,
  usageBytes: 0,
  quotaBytes: 0,
  percentUsed: 0,
}

export async function getStorageHealth(
  storage = globalThis.navigator?.storage,
) {
  if (!storage?.estimate) return UNSUPPORTED

  const [estimate, persisted] = await Promise.all([
    storage.estimate(),
    storage.persisted?.() ?? false,
  ])
  const usageBytes = estimate.usage ?? 0
  const quotaBytes = estimate.quota ?? 0

  return {
    supported: true,
    persisted: Boolean(persisted),
    usageBytes,
    quotaBytes,
    percentUsed: quotaBytes ? Math.round((usageBytes / quotaBytes) * 100) : 0,
  }
}

// Asks the browser not to clear our data when the device runs low on space.
// This does NOT protect against "clear data", uninstalling, or a lost device.
export async function requestPersistence(
  storage = globalThis.navigator?.storage,
) {
  if (!storage?.persist) return false
  return Boolean(await storage.persist())
}

export function storageWarning(health) {
  if (!health.supported)
    return 'This browser does not report storage information.'
  if (health.percentUsed >= 80) {
    return `Storage is ${health.percentUsed}% full. Free up space on this device.`
  }
  if (!health.persisted) {
    return 'The browser may clear this data if the device runs low on space. Keep regular backups.'
  }
  return null
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}
