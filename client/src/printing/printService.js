import { db } from '../db/db.js'
import { getSale } from '../db/saleRepo.js'
import { getSettings } from '../db/settingsRepo.js'
import { AppError } from '../lib/errors.js'
import { newId } from '../lib/id.js'
import { PrinterError } from './printerAdapter.js'
import { buildFullReceipt } from './receiptDocument.js'

// Prints (or reprints) the receipt of a SAVED sale. This never changes the sale,
// its items, or stock. It always returns the job record: check job.status
// ('completed' | 'failed'). A printer problem does not throw.
// Without an explicit language, the language chosen in Settings is used.
export async function printReceipt({ saleId, printer, paperWidth, language }) {
  const data = await getSale(saleId)
  if (!data) throw new AppError('NOT_FOUND', 'Sale not found')

  const settings = await getSettings()
  const width = paperWidth ?? settings.receiptPaperWidth
  const lang = language ?? settings.receiptLanguage ?? 'en'

  // It is a reprint only if an earlier print really completed.
  const completedBefore = await db.printJobs
    .where('saleId')
    .equals(saleId)
    .filter((job) => job.status === 'completed')
    .count()
  const isReprint = completedBefore > 0

  const receipt = buildFullReceipt(data.sale, data.items, {
    paperWidth: width,
    language: lang,
    reprint: isReprint,
    textSize: settings.receiptTextSize,
  })

  const job = {
    id: newId(),
    saleId,
    kind: 'receipt',
    printer: printer.id,
    paperWidth: receipt.paperWidth,
    language: lang,
    isReprint,
    status: 'pending',
    confirmation: 'none',
    error: '',
    createdAt: new Date().toISOString(),
    finishedAt: null,
  }
  await db.printJobs.add(job)

  // The printer call is NOT inside a database transaction on purpose.
  try {
    const result = await printer.print(receipt)
    const done = {
      status: 'completed',
      confirmation: result?.confirmation ?? 'handed_off',
      finishedAt: new Date().toISOString(),
    }
    await db.printJobs.update(job.id, done)
    return { ...job, ...done }
  } catch (err) {
    let message = 'The printer reported an unexpected problem.'
    if (err instanceof PrinterError) message = err.message
    else console.error(err)

    const failed = {
      status: 'failed',
      error: message,
      finishedAt: new Date().toISOString(),
    }
    await db.printJobs.update(job.id, failed)
    return { ...job, ...failed }
  }
}

// Newest first.
export async function listPrintJobs(saleId) {
  const jobs = await db.printJobs.where('saleId').equals(saleId).toArray()
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
