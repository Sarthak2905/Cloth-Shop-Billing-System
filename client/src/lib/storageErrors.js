export function isStorageFull(err) {
  return (
    err?.name === 'QuotaExceededError' ||
    err?.inner?.name === 'QuotaExceededError'
  )
}

// Plain-language reason why the local database could not open.
export function describeDatabaseError(err) {
  if (isStorageFull(err)) return 'This device is out of storage space.'

  if (
    err?.name === 'VersionError' ||
    err?.name === 'DatabaseClosedError' ||
    /blocked/i.test(err?.message ?? '')
  ) {
    return 'The app database is in use by another tab or window. Close the other tabs of this app.'
  }

  if (
    err?.name === 'SecurityError' ||
    err?.name === 'InvalidStateError' ||
    err?.name === 'MissingAPIError'
  ) {
    return 'The browser is blocking local storage. This can happen in private browsing or with strict privacy settings.'
  }

  return 'The app could not open its local database.'
}
