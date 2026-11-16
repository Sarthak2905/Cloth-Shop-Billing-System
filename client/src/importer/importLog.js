import { db } from '../db/db.js'

const KEY = 'importLog'
const KEEP = 50

// A short fingerprint of a string (cyrb53). It is not for security: it only recognises
// a file that was imported before.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

// Based on the CONTENT of the rows, so an .xlsx and a .csv with the same data match,
// blank rows and empty trailing cells do not matter, and 599 equals "599".
export function fingerprintRows(rows) {
  const lines = []
  for (const row of rows) {
    const cells = row.map((cell) =>
      cell === null || cell === undefined ? '' : String(cell).trim(),
    )
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
    if (cells.length === 0) continue
    lines.push(cells.join('\u0001'))
  }
  return `${lines.length}-${cyrb53(lines.join('\n')).toString(16)}`
}

// Returns the earlier import record of this content, or null.
export async function findPreviousImport(fingerprint) {
  const row = await db.settings.get(KEY)
  return (
    (row?.value ?? []).find((record) => record.fingerprint === fingerprint) ??
    null
  )
}

// Call it inside the import transaction (db.settings must be part of it).
export async function addImportRecord(record) {
  const row = await db.settings.get(KEY)
  const list = [record, ...(row?.value ?? [])].slice(0, KEEP)
  await db.settings.put({ key: KEY, value: list })
}
