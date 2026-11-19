import { render, screen } from '@testing-library/react'
import LabelPreview from './LabelPreview'

const label = (over = {}) => ({
    variantId: 'v1', title: 'Pant', size: '', detail: '', unit: 'piece', sku: 'CLO000108',
    barcode: 'CLO000108', symbology: 'code128', warning: null, priceText: 'MRP ₹350.00', ...over,
})

test('the name is shown at the top of the label, above the item name', () => {
    render(<LabelPreview label={label({ header: 'SG Dhokate' })} widthMm={50} heightMm={25} />)

    const header = screen.getByTestId('label-header')
    const title = screen.getByText('Pant')
    expect(header).toHaveTextContent('SG Dhokate')
    expect(header.className).toContain('text-center')
    expect(header.className).toContain('font-bold')
    // the name comes before the item name in the label
    expect(header.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('without a name nothing extra is shown', () => {
    render(<LabelPreview label={label()} widthMm={50} heightMm={25} />)

    expect(screen.queryByTestId('label-header')).not.toBeInTheDocument()
})

test('a label with a name keeps its barcode, number and price', () => {
    render(
        <LabelPreview
            label={label({ header: 'SG Dhokate', detail: 'Size M' })}
            widthMm={50}
            heightMm={25}
        />,
    )

    expect(screen.getByTestId('label-barcode')).toBeInTheDocument()
    expect(screen.getByText('CLO000108')).toBeInTheDocument()
    expect(screen.getByTestId('label-price')).toHaveTextContent('MRP ₹350.00')
    expect(screen.getByTestId('label-detail')).toHaveTextContent('Size M')
})