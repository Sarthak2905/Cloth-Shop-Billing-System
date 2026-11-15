import { readFileAsText } from '../backup/backupService'
import { AppError } from '../lib/errors'
import { parseCsv } from './csv'

async function defaultReadXlsx(file) {
  // Loaded only when an Excel file is chosen, so the rest of the app stays small.
  const mod = await import('read-excel-file')
  const readXlsxFile = mod.default ?? mod
  return readXlsxFile(file) // the first sheet, as rows of cells
}

// Reads a chosen file into rows of cells. The readers can be replaced in tests.
export async function readTable(
  file,
  { readText = readFileAsText, readXlsx = defaultReadXlsx } = {},
) {
  const name = String(file?.name ?? '').toLowerCase()

  if (name.endsWith('.xlsx')) return readXlsx(file)
  if (name.endsWith('.csv') || name.endsWith('.txt'))
    return parseCsv(await readText(file))
  if (name.endsWith('.xls')) {
    throw new AppError(
      'UNSUPPORTED_FILE',
      'This is an old Excel file (.xls). Open it in Excel and use Save As, then choose "Excel Workbook (.xlsx)".',
    )
  }
  throw new AppError(
    'UNSUPPORTED_FILE',
    'Please choose an Excel file (.xlsx) or a CSV file.',
  )
}
