import { db } from '../db/db'
import {
  addImportRecord,
  findPreviousImport,
  fingerprintRows,
} from './importLog'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

test('the same content gives the same fingerprint, whatever the blank rows or empty cells', () => {
  const plain = [
    ['Product Name', 'Quantity', 'Selling Price'],
    ['Shirt', '5', '599'],
  ]
  const padded = [
    [],
    ['Product Name', 'Quantity', 'Selling Price', '', ''],
    ['', ''],
    ['Shirt', '5', '599', ''],
    [],
  ]

  expect(fingerprintRows(padded)).toBe(fingerprintRows(plain))
  expect(
    fingerprintRows([
      ['Product Name', 'Quantity', 'Selling Price'],
      ['Shirt', '6', '599'],
    ]),
  ).not.toBe(fingerprintRows(plain))
})

test('an Excel file (numbers) and a CSV file (text) with the same data match', () => {
  const xlsx = [
    ['Product Name', 'Quantity', 'Selling Price'],
    ['Shirt', 5, 599],
  ]
  const csv = [
    ['Product Name', 'Quantity', 'Selling Price'],
    ['Shirt', '5', '599'],
    ['', '', ''],
  ]

  expect(fingerprintRows(xlsx)).toBe(fingerprintRows(csv))
})

test('an import is remembered, an unknown one is not, and only the latest 50 are kept', async () => {
  expect(await findPreviousImport('x')).toBeNull()

  await db.transaction('rw', db.settings, async () => {
    for (let i = 0; i < 55; i += 1) {
      await addImportRecord({
        fingerprint: `f${i}`,
        fileName: 'a.xlsx',
        importedAt: '2026-11-15T10:00:00.000Z',
        entries: 2,
        pieces: 9,
      })
    }
  })

  expect(await findPreviousImport('f54')).toMatchObject({
    entries: 2,
    pieces: 9,
  })
  expect(await findPreviousImport('f0')).toBeNull()
  expect((await db.settings.get('importLog')).value).toHaveLength(50)
})
