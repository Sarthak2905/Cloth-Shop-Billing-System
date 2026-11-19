import { buildLabel } from './labelModel'

const variant = {
  id: 'v1',
  sku: 'CLO000001',
  barcode: 'CLO000001',
  size: 'M',
  unit: 'piece',
  mrpPaise: 79900,
  sellingPricePaise: 59900,
}
const product = { name: 'Shirt' }

test('the name for the top of the label is trimmed and kept on the label', () => {
  expect(buildLabel(variant, product, { header: '  SG Dhokate ' }).header).toBe(
    'SG Dhokate',
  )
})

test('without a name there is no header on the label at all', () => {
  expect(buildLabel(variant, product)).not.toHaveProperty('header')
  expect(buildLabel(variant, product, { header: '' })).not.toHaveProperty(
    'header',
  )
  expect(buildLabel(variant, product, { header: '   ' })).not.toHaveProperty(
    'header',
  )
  expect(buildLabel(variant, product, { header: null })).not.toHaveProperty(
    'header',
  )
})

test('the rest of the label is the same with or without the name', () => {
  const { header, ...withName } = buildLabel(variant, product, {
    header: 'SG Dhokate',
  })

  expect(header).toBe('SG Dhokate')
  expect(withName).toEqual(buildLabel(variant, product))
})
