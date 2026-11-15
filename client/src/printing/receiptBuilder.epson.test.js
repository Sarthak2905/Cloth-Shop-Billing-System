import { buildReceipt } from './receiptBuilder'
import { visualLength } from './textLayout'

const sale = {
  invoiceNumber: 'INV-000001',
  createdAt: '2026-10-29T10:45:00.000Z',
  shop: {
    name: 'Sarthak Fashions',
    address: 'Main Road, Baramati',
    phone: '9876543210',
    taxId: '',
    footer: '',
  },
  itemCount: 1,
  subtotalPaise: 79900,
  discountPaise: 0,
  taxAddedPaise: 0,
  taxIncludedPaise: 3805,
  roundOffPaise: 0,
  totalPaise: 79900,
  payment: {
    method: 'cash',
    amountTenderedPaise: 80000,
    changePaise: 100,
    reference: '',
  },
}
const items = [
  {
    productName: 'Premium Slim Fit Cotton Casual Shirt With Long Sleeves',
    size: 'M',
    quantity: 1,
    unitPricePaise: 79900,
    grossPaise: 79900,
    lineDiscountPaise: 0,
  },
]

test('the 42-character setting for the Epson TM-T88IV makes every line fit 42 characters', () => {
  const receipt = buildReceipt(sale, items, { paperWidth: '80-42' })

  expect(receipt.paperWidth).toBe('80-42')
  expect(receipt.width).toBe(42)
  expect(receipt.lines.every((line) => visualLength(line) <= 42)).toBe(true)
  const totalRow = receipt.lines.find((line) => line.startsWith('TOTAL'))
  expect(visualLength(totalRow)).toBe(42)
})

test('an unknown paper width falls back to the 58 mm layout', () => {
  const receipt = buildReceipt(sale, items, { paperWidth: 'nonsense' })
  expect(receipt.width).toBe(32)
})
