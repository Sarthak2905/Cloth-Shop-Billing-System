import { groupReceiptItems, isDiscountItem, sizeText } from './receiptItems'

const item = (over = {}) => ({
  productName: 'X',
  size: 'M',
  quantity: 1,
  unit: 'piece',
  unitPricePaise: 10000,
  grossPaise: 10000,
  lineDiscountPaise: 0,
  ...over,
})

test('a size of "-" or an empty size is not printed', () => {
  expect(sizeText('M')).toBe(' (M)')
  expect(sizeText(' 2-3 years ')).toBe(' (2-3 years)')
  for (const none of ['', '-', '--', 'N/A', null, undefined])
    expect(sizeText(none)).toBe('')
})

test('an item takes part in the discount unless it never takes one or was switched off', () => {
  expect(isDiscountItem(item())).toBe(true)
  expect(isDiscountItem(item({ discountAllowed: false }))).toBe(false)
  expect(isDiscountItem(item({ discountExcluded: true }))).toBe(false)
  expect(
    isDiscountItem(item({ discountAllowed: true, discountExcluded: false })),
  ).toBe(true)
})

test('without a bill discount the items stay in one plain list', () => {
  expect(groupReceiptItems({ billDiscountPaise: 0 }, [item()])).toEqual({
    grouped: false,
  })
  expect(groupReceiptItems({}, [item()])).toEqual({ grouped: false })
})

test('with a bill discount the items are split into those with and without it', () => {
  const shirt = item({ productName: 'Shirt', grossPaise: 28000 })
  const pant = item({ productName: 'Pant', grossPaise: 22000 })
  const lining = item({
    productName: 'Lining',
    grossPaise: 3500,
    discountAllowed: false,
  })

  const groups = groupReceiptItems({ billDiscountPaise: 5000 }, [
    lining,
    shirt,
    pant,
  ])

  expect(groups.grouped).toBe(true)
  expect(groups.withDiscount.map((i) => i.productName)).toEqual([
    'Shirt',
    'Pant',
  ])
  expect(groups.withoutDiscount.map((i) => i.productName)).toEqual(['Lining'])
  expect(groups).toMatchObject({
    withDiscountCount: 2,
    subtotalPaise: 50000,
    billDiscountPaise: 5000,
    afterDiscountPaise: 45000,
  })
})

test('an item discount is already taken off in the subtotal of the discounted items', () => {
  const groups = groupReceiptItems({ billDiscountPaise: 1000 }, [
    item({ grossPaise: 50000, lineDiscountPaise: 5000 }),
  ])

  expect(groups.subtotalPaise).toBe(45000)
  expect(groups.afterDiscountPaise).toBe(44000)
})

test('a length of fabric counts as one item', () => {
  const groups = groupReceiptItems({ billDiscountPaise: 100 }, [
    item({ unit: 'meter', quantity: 235 }),
    item({ quantity: 2 }),
  ])

  expect(groups.withDiscountCount).toBe(3)
})

test('when no item can take a discount the list stays plain', () => {
  const groups = groupReceiptItems({ billDiscountPaise: 500 }, [
    item({ discountAllowed: false }),
  ])

  expect(groups).toEqual({ grouped: false })
})
