import { describe, expect, it } from 'vitest'
import { buildReceiptDocument } from '../printing/receiptDocument'
import {
  checkPhone,
  customerKey,
  groupBoughtItems,
  groupCustomers,
  normalizePhone,
  saleMatches,
} from './customer'

describe('phone numbers', () => {
  it('removes spaces, +91 and a leading 0', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('9876543210')
    expect(normalizePhone('098765 43210')).toBe('9876543210')
  })
  it('accepts empty, rejects a wrong number', () => {
    expect(checkPhone('')).toEqual({ phone: '', error: '' })
    expect(checkPhone('12345').error).not.toBe('')
    expect(checkPhone('5876543210').error).not.toBe('') // must start with 6-9
    expect(checkPhone('9876543210').error).toBe('')
  })
})

describe('customers', () => {
  const sales = [
    {
      id: 'a',
      invoiceNumber: 'INV-000001',
      customerName: 'Ravi',
      customerPhone: '9876543210',
      totalPaise: 10000,
      paymentStatus: 'paid',
      createdAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'b',
      invoiceNumber: 'INV-000002',
      customerName: 'Ravi K',
      customerPhone: '9876543210',
      totalPaise: 5000,
      paymentStatus: 'pending',
      createdAt: '2026-11-05T10:00:00Z',
    },
    {
      id: 'c',
      invoiceNumber: 'INV-000003',
      customerName: 'Ravi',
      customerPhone: '9876543210',
      totalPaise: 9999,
      status: 'cancelled',
      createdAt: '2026-11-06T10:00:00Z',
    },
    {
      id: 'd',
      invoiceNumber: 'INV-000004',
      totalPaise: 700,
      createdAt: '2026-11-07T10:00:00Z',
    },
  ]
  it('groups by number, skips cancelled bills and bills without a customer', () => {
    const [c, ...rest] = groupCustomers(sales)
    expect(rest).toHaveLength(0)
    expect(c).toMatchObject({
      phone: '9876543210',
      name: 'Ravi K',
      visits: 2,
      totalPaise: 15000,
      pendingPaise: 5000,
    })
  })
  it('uses the name when there is no number', () => {
    expect(customerKey({ customerName: '  Sita  Devi ' })).toBe('n:sita devi')
    expect(customerKey({})).toBe('')
  })
  it('searches by name, number and invoice number', () => {
    expect(saleMatches(sales[0], 'rav')).toBe(true)
    expect(saleMatches(sales[0], '98765')).toBe(true)
    expect(saleMatches(sales[0], 'inv-000001')).toBe(true)
    expect(saleMatches(sales[0], 'sita')).toBe(false)
    expect(saleMatches(sales[3], '98765')).toBe(false)
  })
  it('adds up what was bought, without cancelled bills', () => {
    const byId = new Map(sales.map((s) => [s.id, s]))
    const items = [
      {
        saleId: 'a',
        variantId: 'v1',
        productName: 'Shirt',
        size: 'M',
        quantity: 1,
      },
      {
        saleId: 'b',
        variantId: 'v1',
        productName: 'Shirt',
        size: 'M',
        quantity: 2,
      },
      {
        saleId: 'c',
        variantId: 'v2',
        productName: 'Pant',
        size: '32',
        quantity: 1,
      },
    ]
    const rows = groupBoughtItems(items, byId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ variantId: 'v1', quantity: 3, times: 2 })
  })
})

describe('receipt', () => {
  const base = {
    shop: { name: 'SG Dhokate' },
    invoiceNumber: 'INV-000001',
    createdAt: '2026-11-01T10:00:00Z',
    itemCount: 1,
    subtotalPaise: 10000,
    discountPaise: 0,
    billDiscountPaise: 0,
    taxAddedPaise: 0,
    roundOffPaise: 0,
    totalPaise: 10000,
    taxPaise: 0,
  }
  const items = [
    {
      productName: 'Shirt',
      size: 'M',
      quantity: 1,
      unit: 'piece',
      unitPricePaise: 10000,
      grossPaise: 10000,
      lineDiscountPaise: 0,
      taxPaise: 0,
    },
  ]
  const texts = (doc) =>
    doc.blocks.flatMap((b) => [b.text, b.left, b.right]).filter(Boolean)

  it('prints the customer name and number', () => {
    const doc = buildReceiptDocument(
      { ...base, customerName: 'Ravi', customerPhone: '9876543210' },
      items,
    )
    expect(texts(doc)).toEqual(
      expect.arrayContaining(['Customer:', 'Ravi', 'Ph:', '9876543210']),
    )
  })
  it('prints nothing extra without a customer', () => {
    expect(texts(buildReceiptDocument(base, items))).not.toContain('Customer:')
  })
})
