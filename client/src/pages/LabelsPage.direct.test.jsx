import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import LabelSettings from '../components/LabelSettings'
import { buildLabelPrintJob, buildTestPrintJob } from '../labels/printJob'
import { savePrinterSettings } from '../labels/printerSettings'
import { setLabelPreset } from '../lib/labelPreset'
import { clearDb, makeItem } from '../test-utils/correctionFixtures'
import { renderLabelsPage } from '../test-utils/renderLabelsPage'

vi.mock('../labels/printJob', () => ({
    buildLabelPrintJob: vi.fn(async () => new Uint8Array([83, 73, 90, 69])),
    buildTestPrintJob: vi.fn(async () => new Uint8Array([84, 69, 83, 84])),
}))

const okReply = (body) =>
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))

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
const printButton = () => screen.getByRole('button', { name: 'Print labels' })

test('with direct printing off, the browser print window is used as before', async () => {
    const fetchMock = okReply({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await renderPage()

    fireEvent.click(printButton())

    expect(window.print).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
})

test('with direct printing on, the labels go to the helper as one job and no print window opens', async () => {
    savePrinterSettings({ direct: true })
    const fetchMock = okReply({ ok: true, bytes: 4 })
    vi.stubGlobal('fetch', fetchMock)
    await renderPage()

    fireEvent.click(printButton())

    expect(await screen.findByText('Sent 2 labels to the printer')).toBeInTheDocument()
    expect(window.print).not.toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:9101/print')
    expect(init.method).toBe('POST')
    expect(Array.from(init.body)).toEqual([83, 73, 90, 69])

    const job = buildLabelPrintJob.mock.calls[0][0]
    expect(job).toMatchObject({ widthMm: 50, heightMm: 25 })
    expect(job.entries).toHaveLength(1)
    expect(job.entries[0]).toMatchObject({
        copies: 2,
        label: { title: 'Astr', barcode: item.variant.barcode },
    })
    expect(job.options).toMatchObject({ gapMm: 3, density: 8, direction: 1 })
})

test('a helper that is not running shows why, and the browser can still be used', async () => {
    savePrinterSettings({ direct: true })
    vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('Failed to fetch')
    }))
    await renderPage()

    fireEvent.click(printButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('not running')
    expect(window.print).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Print with the browser instead' }))
    expect(window.print).toHaveBeenCalledTimes(1)
})

test('the settings made in Settings are saved and used in the next job', async () => {
    vi.stubGlobal('fetch', okReply({ ok: true }))
    render(<LabelSettings />)

    fireEvent.click(screen.getByLabelText('Print directly to the label printer (no print window)'))
    fireEvent.change(screen.getByLabelText('Gap between labels (mm)'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByLabelText(/Turn the label upside-down/))

    expect(JSON.parse(localStorage.getItem('labelPrinterSettings'))).toMatchObject({
        direct: true,
        gapMm: 2.5,
        upsideDown: true,
    })

    cleanup()
    await renderPage()
    fireEvent.click(printButton())
    await screen.findByText('Sent 2 labels to the printer')
    expect(buildLabelPrintJob.mock.calls[0][0].options).toMatchObject({ gapMm: 2.5, direction: 0 })
})

test('Test connection (in Settings) tells which printer the helper uses', async () => {
    const fetchMock = okReply({ ok: true, printer: 'TSC TTP-244 Pro' })
    vi.stubGlobal('fetch', fetchMock)
    render(<LabelSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(
        await screen.findByText('Connected to the label helper. Printer: TSC TTP-244 Pro'),
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:9101/health')
})

test('Print test label (in Settings) sends the test job', async () => {
    const fetchMock = okReply({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    render(<LabelSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Print test label' }))

    expect(await screen.findByText('Test label sent to the printer')).toBeInTheDocument()
    expect(buildTestPrintJob.mock.calls[0][0]).toMatchObject({ widthMm: 50, heightMm: 25 })
    expect(Array.from(fetchMock.mock.calls[0][1].body)).toEqual([84, 69, 83, 84])
})