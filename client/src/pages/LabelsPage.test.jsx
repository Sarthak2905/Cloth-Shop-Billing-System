import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db } from '../db/db'
import { seedSampleData } from '../db/sampleData'
import LabelsPage from './LabelsPage'

beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await seedSampleData()
})

async function showOneOfEach() {
    render(<LabelsPage />)
    const button = screen.getByRole('button', { name: 'Set 1 copy of each shown' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
}

test('one copy of each shown creates a label for every item', async () => {
    await showOneOfEach()
    await waitFor(() => expect(screen.getAllByTestId('label')).toHaveLength(9))
})

test('the price on the label follows the price setting', async () => {
    await showOneOfEach()
    await waitFor(() => expect(screen.getAllByTestId('label-price')).toHaveLength(9))
    expect(screen.getAllByTestId('label-price')[0]).toHaveTextContent('MRP')

    fireEvent.change(screen.getByLabelText('Price on label'), { target: { value: 'none' } })
    await waitFor(() => expect(screen.queryAllByTestId('label-price')).toHaveLength(0))
})