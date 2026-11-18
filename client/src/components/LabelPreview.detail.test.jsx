import { render, screen } from '@testing-library/react'
import LabelPreview from './LabelPreview'

const label = (over = {}) => ({
    variantId: 'v1', title: 'Astr', size: '', detail: '', unit: 'piece', sku: 'CLO000024',
    barcode: 'CLO000024', symbology: 'code128', warning: null, priceText: 'MRP ₹35.00', ...over,
})

test('an item without a size has no "Size" line, and the barcode number is printed once', () => {
    render(<LabelPreview label={label()} widthMm={50} heightMm={25} />)

    expect(screen.queryByTestId('label-detail')).not.toBeInTheDocument()
    expect(screen.queryByText(/Size/)).not.toBeInTheDocument()
    expect(screen.getAllByText('CLO000024')).toHaveLength(1)
    expect(screen.getByTestId('label-price')).toHaveTextContent('MRP ₹35.00')
})

test('a garment shows its size, and fabric shows its price per meter', () => {
    const { rerender } = render(<LabelPreview label={label({ detail: 'Size M' })} widthMm={50} heightMm={25} />)
    expect(screen.getByTestId('label-detail')).toHaveTextContent('Size M')

    rerender(
        <LabelPreview
            label={label({ detail: 'Grey 101', unit: 'meter', priceText: 'MRP ₹450.00 / m' })}
            widthMm={50}
            heightMm={25}
        />,
    )
    expect(screen.getByTestId('label-detail')).toHaveTextContent('Grey 101')
    expect(screen.getByTestId('label-price')).toHaveTextContent('MRP ₹450.00 / m')
})

test('the barcode is drawn with hard edges', () => {
    render(<LabelPreview label={label()} widthMm={50} heightMm={25} />)

    expect(screen.getByTestId('label-barcode').className).toContain('shape-rendering:crispEdges')
})