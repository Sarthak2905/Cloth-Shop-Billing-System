import { buildLabel, validateLabelSize } from './labelModel'
import { formatINR } from '../lib/money'

const product = { id: 'p1', name: 'Cotton Shirt' }
const variant = (over = {}) => ({
  id: 'v1',
  sku: 'SHIRT-M',
  barcode: 'CLO000001',
  size: 'M',
  mrpPaise: 99900,
  sellingPricePaise: 79900,
  ...over,
})

test('builds label text from the variant and product', () => {
  const label = buildLabel(variant(), product)
  expect(label).toMatchObject({
    title: 'Cotton Shirt',
    size: 'M',
    sku: 'SHIRT-M',
    barcode: 'CLO000001',
    symbology: 'code128',
    warning: null,
  })
})

test('the price on the label can be MRP, selling price or hidden', () => {
  expect(buildLabel(variant(), product).priceText).toBe(
    `MRP ${formatINR(99900)}`,
  )
  expect(
    buildLabel(variant(), product, { priceMode: 'selling' }).priceText,
  ).toBe(formatINR(79900))
  expect(
    buildLabel(variant(), product, { priceMode: 'none' }).priceText,
  ).toBeNull()
})

test('uses EAN-13 only for a valid 13-digit barcode', () => {
  const good = buildLabel(variant({ barcode: '4006381333931' }), product)
  expect(good.symbology).toBe('ean13')
  const bad = buildLabel(variant({ barcode: '4006381333932' }), product)
  expect(bad.symbology).toBe('code128')
  expect(bad.warning).toContain('check digit')
})

test('rejects label sizes that are too small or too large', () => {
  expect(validateLabelSize(50, 25)).toBeNull()
  expect(validateLabelSize(10, 25)).toContain('Width')
  expect(validateLabelSize(50, 200)).toContain('Height')
  expect(validateLabelSize(Number.NaN, 25)).toContain('Enter')
})
