import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import StatusBar from './StatusBar'

test('shows whether the device is online', () => {
    render(<StatusBar enabled={false} />)
    expect(screen.getByTestId('online-pill')).toHaveTextContent('Online')

    act(() => {
        window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('online-pill')).toHaveTextContent('Offline')
    expect(screen.getByText(/Billing keeps working/)).toBeInTheDocument()

    act(() => {
        window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByTestId('online-pill')).toHaveTextContent('Online')
})

test('tells the cashier when the app is ready to work offline', async () => {
    const register = vi.fn(async (handlers) => {
        handlers.onOfflineReady()
        return null
    })
    render(<StatusBar enabled register={register} />)

    expect(await screen.findByText('Ready to work offline.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Ready to work offline.')).not.toBeInTheDocument()
})

test('offers an update without forcing it', async () => {
    const worker = { postMessage: vi.fn() }
    const register = vi.fn(async (handlers) => {
        handlers.onUpdateReady(worker)
        return null
    })
    const apply = vi.fn()
    render(<StatusBar enabled register={register} apply={apply} />)

    const button = await screen.findByRole('button', { name: 'Update now' })
    expect(apply).not.toHaveBeenCalled()

    fireEvent.click(button)
    expect(apply).toHaveBeenCalledWith(worker)
})

test('does not register a service worker when disabled', () => {
    const register = vi.fn(async () => null)
    render(<StatusBar enabled={false} register={register} />)
    expect(register).not.toHaveBeenCalled()
})