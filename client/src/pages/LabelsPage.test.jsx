import { screen } from '@testing-library/react'
import { db } from '../db/db'
import { saveLabelPrefs } from '../labels/labelPrefs'
import { renderLabelsPage } from '../test-utils/renderLabelsPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    sessionStorage.clear()
})

test('the Labels page no longer shows the settings summary line', () => {
    saveLabelPrefs({ presetId: '50x25', priceMode: 'mrp' })
    renderLabelsPage()

    expect(screen.getByText('Barcode labels')).toBeInTheDocument()
    expect(screen.queryByText('Change in Settings')).not.toBeInTheDocument()
})