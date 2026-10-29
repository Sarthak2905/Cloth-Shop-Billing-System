import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

test('shows the app title and the products page', async () => {
    render(
        <MemoryRouter>
            <App />
        </MemoryRouter>,
    )
    expect(screen.getByText('Clothing POS')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument()
})