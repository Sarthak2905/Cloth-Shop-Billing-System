import { fireEvent, render } from '@testing-library/react'
import { db } from '../db/db'
import LabelsPage from './LabelsPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    sessionStorage.clear()
})

const printStyle = () =>
    [...document.querySelectorAll('style')].map((s) => s.textContent).find((t) => t.includes('@page')) ?? ''

test('printing asks for a page exactly as big as the label, with no margin', () => {
    render(<LabelsPage />)

    expect(printStyle()).toContain('@page { size: 50mm 25mm; margin: 0; }')
})

test('every label is its own page, except that the last one does not add an empty page', () => {
    render(<LabelsPage />)

    const css = printStyle()
    expect(css).toContain('#label-sheet > * { break-after: page;')
    expect(css).toContain('#label-sheet > *:last-child { break-after: auto;')
})

test('the page size follows the chosen label size, including a custom one', () => {
    const { getByLabelText } = render(<LabelsPage />)

    fireEvent.change(getByLabelText('Label size'), { target: { value: '40x30' } })
    expect(printStyle()).toContain('size: 40mm 30mm')

    fireEvent.change(getByLabelText('Label size'), { target: { value: 'custom' } })
    fireEvent.change(getByLabelText('Width (mm)'), { target: { value: '60' } })
    fireEvent.change(getByLabelText('Height (mm)'), { target: { value: '40' } })
    expect(printStyle()).toContain('size: 60mm 40mm')
})

test('no page style is added for a size that is not valid', () => {
    const { getByLabelText } = render(<LabelsPage />)

    fireEvent.change(getByLabelText('Label size'), { target: { value: 'custom' } })
    fireEvent.change(getByLabelText('Width (mm)'), { target: { value: '5' } })

    expect(printStyle()).toBe('')
})