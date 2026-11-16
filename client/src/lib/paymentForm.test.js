import {
  EMPTY_PAYMENT_FORM,
  formFromSale,
  paymentStatusText,
  paymentsFromForm,
} from './paymentForm'
import { summarizePayments } from './payments'

test('blank boxes are skipped and amounts are turned into paise', () => {
  const { payments, error } = paymentsFromForm({
    ...EMPTY_PAYMENT_FORM,
    cash: '₹500',
    upi: '520.50',
    upiRef: 'T1',
  })

  expect(error).toBeNull()
  expect(payments).toEqual([
    { method: 'cash', amountPaise: 50000, reference: '' },
    { method: 'upi', amountPaise: 52050, reference: 'T1' },
  ])
})

test('a wrong amount names the box', () => {
  expect(paymentsFromForm({ ...EMPTY_PAYMENT_FORM, upi: 'abc' }).error).toBe(
    'Enter the UPI amount like 500 or 500.50',
  )
  expect(paymentsFromForm({ ...EMPTY_PAYMENT_FORM, card: '5.555' }).error).toBe(
    'Enter the Card amount like 500 or 500.50',
  )
  expect(paymentsFromForm(EMPTY_PAYMENT_FORM)).toEqual({
    payments: [],
    error: null,
  })
})

test('the boxes are filled from a bill that already has a payment', () => {
  const sale = {
    totalPaise: 102000,
    payments: [
      { method: 'cash', amountPaise: 50000, reference: '' },
      { method: 'upi', amountPaise: 52000, reference: 'T9' },
    ],
  }

  expect(formFromSale(sale)).toEqual({
    cash: '500.00',
    upi: '520.00',
    card: '',
    upiRef: 'T9',
  })
  expect(
    formFromSale({
      totalPaise: 100,
      payment: { method: 'card', amountTenderedPaise: 100 },
    }).card,
  ).toBe('1.00')
  expect(
    formFromSale({ totalPaise: 100, paymentStatus: 'pending', payments: [] }),
  ).toEqual(EMPTY_PAYMENT_FORM)
})

test('the status line says received, short, change or exact', () => {
  const text = (payments) =>
    paymentStatusText(summarizePayments(102000, payments))

  expect(text([])).toBeNull()
  expect(text([{ method: 'cash', amountPaise: 100000 }])).toBe(
    'Received ₹1,000.00 · Short ₹20.00',
  )
  expect(text([{ method: 'cash', amountPaise: 110000 }])).toBe(
    'Received ₹1,100.00 · Change ₹80.00',
  )
  expect(text([{ method: 'upi', amountPaise: 102000 }])).toBe(
    'Received ₹1,020.00 · Exact',
  )
})
