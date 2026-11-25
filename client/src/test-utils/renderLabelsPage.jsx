import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LabelsPage from '../pages/LabelsPage'

export function renderLabelsPage() {
    return render(
        <MemoryRouter>
            <LabelsPage />
        </MemoryRouter>,
    )
}