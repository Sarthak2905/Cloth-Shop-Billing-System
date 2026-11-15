import {
  addItem,
  createCart,
  lineFromVariant,
  setBillDiscount,
} from '../billing/cart'
import { buildCorrectionCart, correctSale } from '../db/correctionRepo'
import { db } from '../db/db'
import { createProduct } from '../db/productRepo'
import { createSale } from '../db/saleRepo'
import { createVariant } from '../db/variantRepo'
import { newId } from '../lib/id'

export async function clearDb() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

// One product with one size in stock.
export async function makeItem({
  name = 'Shirt',
  size = 'M',
  stock = 10,
  price = 59900,
  barcode = 'BC-0001',
  sku = 'SKU-1',
} = {}) {
  const product = await createProduct({ name, category: 'Shirts' })
  await createVariant({
    productId: product.id,
    size,
    sku,
    barcode,
    costPaise: 0,
    mrpPaise: price,
    sellingPricePaise: price,
    taxRatePercent: 5,
    priceIncludesTax: true,
    openingStock: stock,
    reorderThreshold: 3,
  })
  const variant = (await db.variants.toArray()).find((v) => v.sku === sku)
  return { product: await db.products.get(product.id), variant }
}

// Sells `quantity` of an item and returns the saved sale.
export async function sellItem(
  { product, variant },
  quantity = 1,
  { billDiscount = null, method = 'cash' } = {},
) {
  let cart = createCart()
  for (let i = 0; i < quantity; i += 1) {
    cart = addItem(cart, lineFromVariant(variant, product)).cart
  }
  if (billDiscount) cart = setBillDiscount(cart, billDiscount).cart
  const { sale } = await createSale({ id: newId(), cart, payment: { method } })
  return sale
}

// Corrects a bill without changing anything on it.
export async function correctUnchanged(oldSale, reason = 'Wrong price') {
  const { cart } = await buildCorrectionCart(oldSale.id)
  return correctSale({
    oldSaleId: oldSale.id,
    newSaleId: newId(),
    reason,
    cart,
    payment: { method: 'cash' },
  })
}
