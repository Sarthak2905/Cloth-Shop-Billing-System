import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('../db/variantRepo.js', () => ({
  getVariantByBarcode: vi.fn(),
}))
vi.mock('../db/productRepo.js', () => ({
  getProduct: vi.fn(),
}))

import { getProduct } from '../db/productRepo.js'
import { getVariantByBarcode } from '../db/variantRepo.js'
import { lookupBarcode } from './scanService.js'

const variant = {
  id: 'v1',
  productId: 'p1',
  barcode: 'CLO000425',
  status: 'active',
}
const product = { id: 'p1', name: 'Cotton Shirt', status: 'active' }

beforeEach(() => {
  vi.clearAllMocks()
  getProduct.mockResolvedValue(product)
  getVariantByBarcode.mockImplementation(async (code) =>
    code === 'CLO000425' ? variant : null,
  )
})

test('a barcode scanned in small letters still finds the item', async () => {
  const result = await lookupBarcode('clo000425')
  expect(result.status).toBe('found')
  expect(result.variant.id).toBe('v1')
  expect(result.barcode).toBe('CLO000425')
})

test('the exact barcode is found on the first try', async () => {
  const result = await lookupBarcode('CLO000425')
  expect(result.status).toBe('found')
  expect(getVariantByBarcode).toHaveBeenCalledTimes(1)
})

test('a barcode that really does not exist is still not found', async () => {
  const result = await lookupBarcode('clo999999')
  expect(result.status).toBe('not_found')
  expect(result.message).toContain('clo999999')
})
