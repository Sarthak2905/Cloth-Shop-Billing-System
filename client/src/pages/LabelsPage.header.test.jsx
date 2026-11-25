import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import LabelSettings from '../components/LabelSettings'
import { db } from '../db/db'
import { buildLabelPrintJob } from '../labels/printJob'
import { savePrinterSettings } from '../labels/printerSettings'
import { setLabelPreset } from '../lib/labelPreset'
import { clearDb, makeItem } from '../test-utils/correctionFixtures'
import { renderLabelsPage } from '../test-utils/renderLabelsPage'

vi.mock('../labels/printJob', () => ({
    buildLabelPrintJob: vi.fn(async () => new Uint8Array([83, 73, 90, 69])),
    buildTestPrintJob: vi.fn(async () => new Uint8Array([84, 69, 83, 84])),
}))

let item

beforeEach(async () => {
    await clearDb()
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    item = await makeItem({ name: 'Astr', stock: 10 })
    setLabelPreset({ [item.variant.id]: 2 })
    window.print = vi.fn()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

async function renderPage() {
    renderLabelsPage()
    await screen.findByLabelText(/Copies of Astr/)
}
const settingsBox = () => screen.getByLabelText('Name at the top of the label')

test('the name typed in Settings is saved', async () => {
    render(<LabelSettings />)

    fireEvent.change(settingsBox(), { target: { value: 'SG Dhokate' } })

    await waitFor(async () => expect((await db.settings.get('labelHeader')).value).toBe('SG Dhokate'))
})

test('the saved name comes back when Settings is opened again', async () => {
    await db.settings.put({ key: 'labelHeader', value: 'SG Dhokate' })

    render(<LabelSettings />)

    await waitFor(() => expect(settingsBox()).toHaveValue('SG Dhokate'))
})

test('the name is cut at 30 characters', async () => {
    render(<LabelSettings />)

    fireEvent.change(settingsBox(), { target: { value: 'X'.repeat(45) } })

    await waitFor(() => expect(settingsBox()).toHaveValue('X'.repeat(30)))
    await waitFor(async () => expect((await db.settings.get('labelHeader')).value).toBe('X'.repeat(30)))
})

test('clearing the box removes the saved name', async () => {
    await db.settings.put({ key: 'labelHeader', value: 'SG Dhokate' })
    render(<LabelSettings />)
    await waitFor(() => expect(settingsBox()).toHaveValue('SG Dhokate'))

    fireEvent.change(settingsBox(), { target: { value: '' } })

    await waitFor(async () => expect((await db.settings.get('labelHeader')).value).toBe(''))
})

test('the saved name is shown on the top of every label on the Labels page', async () => {
    await db.settings.put({ key: 'labelHeader', value: 'SG Dhokate' })

    await renderPage()

    const headers = await screen.findAllByTestId('label-header')
    expect(headers).toHaveLength(2) // one for each copy
    expect(headers[0]).toHaveTextContent('SG Dhokate')
})

test('without a name the labels show none', async () => {
    await renderPage()

    expect(screen.queryAllByTestId('label-header')).toHaveLength(0)
})

test('direct printing sends the name with each label', async () => {
    savePrinterSettings({ direct: true })
    await db.settings.put({ key: 'labelHeader', value: 'SG Dhokate' })
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })),
    )
    await renderPage()
    await screen.findAllByTestId('label-header') // the name has been loaded

    fireEvent.click(screen.getByRole('button', { name: 'Print labels' }))

    expect(await screen.findByText('Sent 2 labels to the printer')).toBeInTheDocument()
    const { entries } = buildLabelPrintJob.mock.calls[0][0]
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ copies: 2, label: { title: 'Astr', header: 'SG Dhokate' } })
})

test('direct printing without a name sends no name', async () => {
    savePrinterSettings({ direct: true })
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })),
    )
    await renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Print labels' }))

    await screen.findByText('Sent 2 labels to the printer')
    expect(buildLabelPrintJob.mock.calls[0][0].entries[0].label).not.toHaveProperty('header')
})