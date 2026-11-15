import { render, screen } from '@testing-library/react'
import ReceiptPreview from './ReceiptPreview'

test('shows the receipt layout when the receipt has a document', () => {
    const receipt = {
        cut: true,
        text: 'fallback text',
        document: {
            paperWidth: '80-42',
            language: 'en',
            textSize: 'large',
            blocks: [
                { kind: 'center', text: 'Sarthak Fashions' },
                { kind: 'row', left: 'TOTAL', right: '764.00' },
            ],
        },
    }
    render(<ReceiptPreview receipt={receipt} />)

    const preview = screen.getByTestId('receipt-preview')
    expect(preview).toHaveTextContent('Sarthak Fashions')
    expect(preview).toHaveTextContent('764.00')
    expect(preview).not.toHaveTextContent('fallback text')
    expect(screen.getByText(/cut here/)).toBeInTheDocument()
})

test('falls back to plain text when there is no document', () => {
    render(<ReceiptPreview receipt={{ text: 'plain receipt text', cut: false }} />)
    expect(screen.getByTestId('receipt-preview')).toHaveTextContent('plain receipt text')
})