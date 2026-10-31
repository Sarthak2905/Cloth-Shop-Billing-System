import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import { createSale } from '../db/saleRepo'
import { addItem, createCart, lineFromVariant } from '../billing/cart'
import { backupToJson, exportBackup } from '../backup/backupService'
import { newId } from '../lib/id'
import BackupPage from './BackupPage'

function renderPage() {
    const saveFile = vi.fn()
    render(
        <MemoryRouter>
            <BackupPage saveFile={saveFile} shareFile={vi.fn()} />
        </MemoryRouter>,
    )
    return { saveFile }
}

function chooseFile(text) {
    const file = new File([text], 'backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [file] } })
}

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
})

test('saves a backup file and records the time', async () => {
    await seedSampleData()
    const { saveFile } = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Download backup file' }))

    expect(await screen.findByText(/Backup saved as/)).toBeInTheDocument()
    expect(saveFile).toHaveBeenCalledTimes(1)
    const [name, text] = saveFile.mock.calls[0]
    expect(name).toMatch(/^clothing-pos-backup-.*\.json$/)
    expect(JSON.parse(text).format).toBe('clothing-pos-backup')
    expect((await db.settings.get('lastBackupAt')).value).toBeTruthy()
})

test('shows a clear error for a file that is not a backup', async () => {
    renderPage()
    chooseFile('{"hello":1}')

    expect(await screen.findByText('This file is not a Clothing POS backup.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore backup' })).not.toBeInTheDocument()
})

test('restores a valid backup after confirmation and keeps a safety copy', async () => {
    await seedSampleData()
    const fileText = backupToJson(await exportBackup()) // the device before any sale

    // The device changes after the backup: one sale is made.
    const variant = (await db.variants.toArray())[0]
    const product = await db.products.get(variant.productId)
    const cart = addItem(createCart(), lineFromVariant(variant, product)).cart
    await createSale({ id: newId(), cart, payment: { method: 'cash' } })
    expect(await db.sales.count()).toBe(1)

    const { saveFile } = renderPage()
    chooseFile(fileText)

    expect(await screen.findByText(/made after this backup/)).toBeInTheDocument()
    const restore = screen.getByRole('button', { name: 'Restore backup' })
    expect(restore).toBeDisabled()

    fireEvent.click(screen.getByLabelText(/I understand/))
    expect(restore).toBeEnabled()
    fireEvent.click(restore)

    expect(await screen.findByText(/Backup restored/)).toBeInTheDocument()
    expect(saveFile).toHaveBeenCalledTimes(1)
    expect(saveFile.mock.calls[0][0]).toContain('before-restore')
    expect(await db.sales.count()).toBe(0)
})