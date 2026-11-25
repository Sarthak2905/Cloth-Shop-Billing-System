import { screen } from '@testing-library/react'
import { db } from '../db/db'
import { saveLabelPrefs } from '../labels/labelPrefs'
import { renderLabelsPage } from '../test-utils/renderLabelsPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    sessionStorage.clear()
})

test('the Labels page shows the price setting chosen in Settings', () => {
    saveLabelPrefs({ presetId: '50x25', priceMode: 'mrp' })
    renderLabelsPage()

    expect(screen.getByText(/MRP/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change in Settings' })).toHaveAttribute('href', '/settings')
})