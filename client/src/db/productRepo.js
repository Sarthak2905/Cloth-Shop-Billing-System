import { db } from './db.js'
import { productInputSchema, validate } from './schemas.js'
import { AppError } from '../lib/errors.js'
import { newId } from '../lib/id.js'

export async function createProduct(input) {
  const data = validate(productInputSchema, {
    brand: '',
    supplier: '',
    ...input,
  })
  const now = new Date().toISOString()
  const product = {
    id: newId(),
    ...data,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  await db.products.add(product)
  return product
}

export function getProduct(id) {
  return db.products.get(id)
}

export async function listProducts({ status = 'active' } = {}) {
  return db.products.where('status').equals(status).sortBy('name')
}

export async function updateProduct(id, changes) {
  const existing = await db.products.get(id)
  if (!existing) throw new AppError('NOT_FOUND', 'Product not found')

  const data = validate(productInputSchema, { ...existing, ...changes })
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() }
  await db.products.put(updated)
  return updated
}

// We archive instead of delete, so old sales keep pointing at real records.
export async function archiveProduct(id) {
  await db.transaction('rw', db.products, db.variants, async () => {
    const existing = await db.products.get(id)
    if (!existing) throw new AppError('NOT_FOUND', 'Product not found')
    const now = new Date().toISOString()
    await db.products.update(id, { status: 'archived', updatedAt: now })
    await db.variants
      .where('productId')
      .equals(id)
      .modify({ status: 'archived', updatedAt: now })
  })
}
