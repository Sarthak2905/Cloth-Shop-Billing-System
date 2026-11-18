import { buildLabel, labelDetail } from './labelModel'

const variant = (over = {}) => ({
  id: 'v1',
  sku: 'CLO000001',
  barcode: 'CLO000001',
  size: 'M',
  unit: 'piece',
  mrpPaise: 79900,
  sellingPricePaise: 59900,
  ...over,
})
const product = { name: 'Shirt' }

test('a garment label says "Size M", and has no size line when there is no size', () => {
  expect(labelDetail(variant())).toBe('Size M')
  for (const none of ['', '-', ' -- ', 'N/A', undefined, null]) {
    expect(labelDetail(variant({ size: none }))).toBe('')
  }
})

test('a fabric label shows the design or shade as it is', () => {
  expect(labelDetail(variant({ unit: 'meter', size: 'Grey 101' }))).toBe(
    'Grey 101',
  )
  expect(labelDetail(variant({ unit: 'meter', size: '' }))).toBe('')
})

test('fabric prices say per meter, garment prices do not', () => {
  const fabric = variant({
    unit: 'meter',
    mrpPaise: 45000,
    sellingPricePaise: 45000,
  })

  expect(buildLabel(fabric, product, { priceMode: 'mrp' }).priceText).toBe(
    'MRP ₹450.00 / m',
  )
  expect(buildLabel(fabric, product, { priceMode: 'selling' }).priceText).toBe(
    '₹450.00 / m',
  )
  expect(buildLabel(variant(), product, { priceMode: 'mrp' }).priceText).toBe(
    'MRP ₹799.00',
  )
  expect(
    buildLabel(variant(), product, { priceMode: 'selling' }).priceText,
  ).toBe('₹599.00')
  expect(
    buildLabel(variant(), product, { priceMode: 'none' }).priceText,
  ).toBeNull()
})

test('the label carries the unit and the line under the name', () => {
  expect(
    buildLabel(variant({ unit: 'meter', size: 'Black' }), product),
  ).toMatchObject({
    unit: 'meter',
    detail: 'Black',
    title: 'Shirt',
    barcode: 'CLO000001',
  })
  expect(buildLabel({ ...variant(), unit: undefined }, product).unit).toBe(
    'piece',
  )
})
