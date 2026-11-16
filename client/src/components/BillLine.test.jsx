import { fireEvent, render, screen } from '@testing-library/react'
import BillLine from './BillLine'

const line = (over = {}) => ({
  variantId: 'v1', productName: 'Shirt', size: 'M', unitPricePaise: 28000, availableStock: 5,
  quantity: 2, discountAllowed: true, discountExcluded: false, discount: null, ...over,
})
const totals = { grossPaise: 56000, lineDiscountPaise: 0 }

function setup(l = line(), props = {}) {
  const handlers = {
    onQuantity: vi.fn(), onRemove: vi.fn(), onDiscount: vi.fn(), onToggleExcluded: vi.fn(),
  }
  render(
    <ul>
      <BillLine line={l} totals={totals} {...handlers} {...props} />
    </ul>,
  )
  return handlers
}

test('shows the name, size, price, stock and the amount of the row', () => {
  setup()

  expect(screen.getByText('Shirt (M)')).toBeInTheDocument()
  expect(screen.getByText(/₹280.00 each · 5 in stock/)).toBeInTheDocument()
  expect(screen.getByText('₹560.00')).toBeInTheDocument()
  expect(screen.getByTestId('qty')).toHaveTextContent('2')
})

test('+, - and Remove work', () => {
  const { onQuantity, onRemove } = setup()

  fireEvent.click(screen.getByLabelText('Increase quantity'))
  fireEvent.click(screen.getByLabelText('Decrease quantity'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

  expect(onQuantity).toHaveBeenNthCalledWith(1, 3)
  expect(onQuantity).toHaveBeenNthCalledWith(2, 1)
  expect(onRemove).toHaveBeenCalledTimes(1)
})

test('the "No discount" switch turns the discount off for this item on this bill, and back on', () => {
  const { onToggleExcluded } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'No discount' }))
  expect(onToggleExcluded).toHaveBeenCalledWith(true)
})

test('an item switched off says so and offers to allow the discount again', () => {
  const { onToggleExcluded } = setup(line({ discountExcluded: true }))

  expect(screen.getByText(/no discount on this bill/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Allow discount' }))
  expect(onToggleExcluded).toHaveBeenCalledWith(false)
})

test('a product that never takes a discount has no discount buttons', () => {
  setup(line({ discountAllowed: false }))

  expect(screen.getByText(/never discounted/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Discount' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'No discount' })).not.toBeInTheDocument()
})

test('an item discount is shown in green', () => {
  setup(line({ discount: { type: 'percent', value: 10 } }), {
    totals: { grossPaise: 56000, lineDiscountPaise: 5600 },
  })

  expect(screen.getByText('Discount -₹56.00')).toBeInTheDocument()
  expect(screen.getByText('₹504.00')).toBeInTheDocument()
})

test('an item with no size has no empty brackets', () => {
  setup(line({ size: '-' }))

  expect(screen.getByText('Shirt')).toBeInTheDocument()
})