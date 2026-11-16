import {
  paymentBreakdown,
  paymentInfo,
  paymentText,
  summarizePayments,
} from './payments'

const TOTAL = 102000 // ₹1,020

test('nothing received means payment pending', () => {
  const r = summarizePayments(TOTAL, [])

  expect(r).toMatchObject({
    status: 'pending',
    receivedPaise: 0,
    shortPaise: TOTAL,
    changePaise: 0,
  })
  expect(r.summary).toEqual({
    method: 'pending',
    amountTenderedPaise: 0,
    changePaise: 0,
    reference: '',
  })
})

test('the exact amount is paid', () => {
  const r = summarizePayments(TOTAL, [
    { method: 'upi', amountPaise: TOTAL, reference: ' T123 ' },
  ])

  expect(r).toMatchObject({
    status: 'paid',
    receivedPaise: TOTAL,
    shortPaise: 0,
    changePaise: 0,
  })
  expect(r.summary).toEqual({
    method: 'upi',
    amountTenderedPaise: TOTAL,
    changePaise: 0,
    reference: 'T123',
  })
})

test('a bargain: less than the bill is accepted and the short amount is kept', () => {
  const r = summarizePayments(TOTAL, [{ method: 'cash', amountPaise: 100000 }])

  expect(r).toMatchObject({
    status: 'paid',
    receivedPaise: 100000,
    shortPaise: 2000,
    changePaise: 0,
  })
})

test('more cash than the bill gives change', () => {
  const r = summarizePayments(TOTAL, [{ method: 'cash', amountPaise: 110000 }])

  expect(r).toMatchObject({
    receivedPaise: 110000,
    changePaise: 8000,
    shortPaise: 0,
  })
})

test('half cash and half UPI is a split payment', () => {
  const r = summarizePayments(TOTAL, [
    { method: 'cash', amountPaise: 50000 },
    { method: 'upi', amountPaise: 52000, reference: 'T9' },
  ])

  expect(r).toMatchObject({
    status: 'paid',
    receivedPaise: 102000,
    shortPaise: 0,
    changePaise: 0,
  })
  expect(r.summary).toMatchObject({ method: 'split', reference: 'T9' })
  expect(r.payments).toHaveLength(2)
})

test('only cash can give change', () => {
  // UPI above the bill: there is no cash to give the extra back
  expect(
    summarizePayments(TOTAL, [{ method: 'upi', amountPaise: TOTAL + 100 }])
      .error,
  ).toMatch(/Only cash/)

  // card above the bill, with only a little cash: the cash cannot cover the extra
  expect(
    summarizePayments(TOTAL, [
      { method: 'cash', amountPaise: 1000 },
      { method: 'card', amountPaise: TOTAL + 100 },
    ]).error,
  ).toMatch(/Only cash/)

  // enough cash to give the extra back as change is fine
  expect(
    summarizePayments(TOTAL, [
      { method: 'cash', amountPaise: 20000 },
      { method: 'upi', amountPaise: TOTAL },
    ]).changePaise,
  ).toBe(20000)
})

test('zero amounts are dropped and wrong lines are refused', () => {
  expect(
    summarizePayments(TOTAL, [{ method: 'cash', amountPaise: 0 }]).status,
  ).toBe('pending')
  expect(
    summarizePayments(TOTAL, [{ method: 'cheque', amountPaise: 100 }]).error,
  ).toBe('Unknown payment method')
  expect(
    summarizePayments(TOTAL, [{ method: 'cash', amountPaise: -5 }]).error,
  ).toBe('Enter a valid payment amount')
  expect(
    summarizePayments(TOTAL, [{ method: 'cash', amountPaise: 1.5 }]).error,
  ).toBe('Enter a valid payment amount')
  expect(
    summarizePayments(TOTAL, [
      { method: 'upi', amountPaise: 100, reference: 'x'.repeat(41) },
    ]).error,
  ).toMatch(/too long/)
})

test('older bills with one payment are still understood', () => {
  const old = {
    totalPaise: TOTAL,
    payment: {
      method: 'cash',
      amountTenderedPaise: 110000,
      changePaise: 8000,
      reference: '',
    },
  }

  expect(paymentBreakdown(old)).toEqual([
    { method: 'cash', label: 'Cash', amountPaise: 110000, reference: '' },
  ])
  expect(paymentInfo(old)).toEqual({
    status: 'paid',
    receivedPaise: 110000,
    changePaise: 8000,
    shortPaise: 0,
  })
  expect(paymentText(old)).toBe('Cash')
})

test('a pending bill and a split bill are described', () => {
  expect(paymentText({ paymentStatus: 'pending' })).toBe('Payment pending')
  expect(
    paymentInfo({ paymentStatus: 'pending', totalPaise: TOTAL }),
  ).toMatchObject({
    status: 'pending',
    shortPaise: TOTAL,
  })

  const split = {
    totalPaise: TOTAL,
    paymentStatus: 'paid',
    payments: [
      { method: 'cash', amountPaise: 50000, reference: '' },
      { method: 'upi', amountPaise: 52000, reference: '' },
    ],
    receivedPaise: 102000,
    shortPaise: 0,
    payment: { changePaise: 0 },
  }
  expect(paymentText(split)).toBe('Cash + UPI')
  expect(paymentInfo(split)).toMatchObject({
    receivedPaise: 102000,
    shortPaise: 0,
  })
})
