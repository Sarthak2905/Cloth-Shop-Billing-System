import { buildFullReceipt } from './receiptDocument'

const base = {
  invoiceNumber: 'INV-000030',
  createdAt: '2026-11-16T09:00:00.000Z',
  shop: {
    name: 'Shop',
    address: '',
    phone: '',
    taxId: '27ABCDE1234F1Z5',
    footer: '',
  },
  itemCount: 1,
  subtotalPaise: 102000,
  discountPaise: 0,
  taxAddedPaise: 0,
  taxIncludedPaise: 4857,
  taxPaise: 4857,
  roundOffPaise: 0,
  totalPaise: 102000,
}
const items = [
  {
    productName: 'Shirt',
    size: 'M',
    unit: 'piece',
    quantity: 2,
    unitPricePaise: 51000,
    grossPaise: 102000,
    lineDiscountPaise: 0,
    taxRatePercent: 5,
    taxPaise: 4857,
  },
]
const pending = {
  ...base,
  paymentStatus: 'pending',
  payment: {
    method: 'pending',
    amountTenderedPaise: 0,
    changePaise: 0,
    reference: '',
  },
}
const paid = {
  ...base,
  paymentStatus: 'paid',
  payment: {
    method: 'cash',
    amountTenderedPaise: 100000,
    changePaise: 0,
    reference: '',
  },
}

test('the customer bill has no payment, received or change lines', () => {
  for (const language of ['en', 'mr']) {
    const receipt = buildFullReceipt(paid, items, {
      paperWidth: '80-42',
      language,
    })
    const text = receipt.document.blocks
      .map((b) => [b.text, b.left, b.right].filter(Boolean).join(' '))
      .join('\n')

    for (const word of [
      'Payment',
      'Received',
      'Change',
      'Cash',
      'भरणा',
      'मिळालेले',
      'रोख',
    ]) {
      expect(text).not.toContain(word)
      expect(receipt.text).not.toContain(word)
    }
  }
})

test('the bill is exactly the same before and after the payment is known', () => {
  const a = buildFullReceipt(pending, items, { paperWidth: '80-42' })
  const b = buildFullReceipt(paid, items, { paperWidth: '80-42' })

  expect(a.document).toEqual(b.document)
  expect(a.text).toBe(b.text)
})

test('GST and the shop GSTIN are on the bill', () => {
  const receipt = buildFullReceipt(paid, items, { paperWidth: '80-42' })
  const rows = receipt.document.blocks
    .filter((b) => b.kind === 'row')
    .map((b) => `${b.left} ${b.right}`)
  const centred = receipt.document.blocks
    .filter((b) => b.kind === 'center')
    .map((b) => b.text)

  expect(rows).toContain('GST 5% 48.57')
  expect(centred).toContain('GSTIN: 27ABCDE1234F1Z5')
})
