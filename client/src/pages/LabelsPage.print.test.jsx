import { screen } from '@testing-library/react'
import { db } from '../db/db'
import { saveLabelPrefs } from '../labels/labelPrefs'
import { renderLabelsPage } from '../test-utils/renderLabelsPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    sessionStorage.clear()
})

const printStyle = () =>
    [...document.querySelectorAll('style')].map((s) => s.textContent).find((t) => t.includes('@page')) ?? ''

test('printing asks for a page exactly as big as the label, with no margin', () => {
    renderLabelsPage()

    expect(printStyle()).toContain('@page { size: 50mm 25mm; margin: 0; }')
})

test('every label is its own page, except that the last one does not add an empty page', () => {
    renderLabelsPage()

    const css = printStyle()
    expect(css).toContain('#label-sheet > * { break-after: page;')
    expect(css).toContain('#label-sheet > *:last-child { break-after: auto;')
})

test('the page size follows the label size chosen in Settings, including a custom one', () => {
    saveLabelPrefs({ presetId: '40x30', customWidth: '50', customHeight: '25', priceMode: 'mrp' })
    const first = renderLabelsPage()
    expect(printStyle()).toContain('size: 40mm 30mm')
    first.unmount()

    saveLabelPrefs({ presetId: 'custom', customWidth: '60', customHeight: '40', priceMode: 'mrp' })
    renderLabelsPage()
    expect(printStyle()).toContain('size: 60mm 40mm')
})

test('no page style is added for a size that is not valid', () => {
    saveLabelPrefs({ presetId: 'custom', customWidth: '5', customHeight: '25', priceMode: 'mrp' })
    renderLabelsPage()

    expect(screen.getByText(/mm/, { selector: 'p.text-red-600' })).toBeInTheDocument()
    expect(printStyle()).toBe('')
})