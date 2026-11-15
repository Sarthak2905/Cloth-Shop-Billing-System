import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import ProductForm from './ProductForm'

test('the discount box is ticked by default and can be switched off', async () => {
    const onSubmit = vi.fn(async () => { })
    render(<ProductForm onSubmit={onSubmit} />)

    const box = screen.getByLabelText('Allow discounts on this product')
    expect(box).toBeChecked()

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Branded Jacket' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Jackets' } })
    fireEvent.click(box)
    expect(screen.getByText(/will never be included in a bill discount/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))

    await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Branded Jacket', discountAllowed: false }),
        ),
    )
})

test('an existing product shows its setting, and older products show the box ticked', () => {
    const { unmount } = render(
        <ProductForm initial={{ name: 'Jacket', category: 'Jackets', discountAllowed: false }} onSubmit={vi.fn()} />,
    )
    expect(screen.getByLabelText('Allow discounts on this product')).not.toBeChecked()
    unmount()

    render(<ProductForm initial={{ name: 'Shirt', category: 'Shirts' }} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('Allow discounts on this product')).toBeChecked()
})