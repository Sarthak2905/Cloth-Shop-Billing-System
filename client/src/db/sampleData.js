import { db } from './db.js'
import { createProduct } from './productRepo.js'
import { createVariant, generateBarcode } from './variantRepo.js'
import { rupeesToPaise } from '../lib/money.js'

// Sample values only. Tax rates here are placeholders; confirm the correct
// GST rate for your products with your accountant before real use.
const SAMPLES = [
  {
    product: {
      name: 'Cotton Shirt',
      category: 'Shirts',
      brand: 'UrbanFit',
      supplier: 'Pune Garments',
    },
    code: 'SHIRT',
    sizes: ['M', 'L', 'XL'],
    cost: '320',
    mrp: '999',
    price: '799',
  },
  {
    product: {
      name: 'Denim Jeans',
      category: 'Jeans',
      brand: 'BlueRiver',
      supplier: 'Pune Garments',
    },
    code: 'JEANS',
    sizes: ['30', '32', '34'],
    cost: '550',
    mrp: '1599',
    price: '1299',
  },
  {
    product: {
      name: 'Printed T-Shirt',
      category: 'T-Shirts',
      brand: 'UrbanFit',
      supplier: 'Mumbai Textiles',
    },
    code: 'TEE',
    sizes: ['S', 'M', 'L'],
    cost: '150',
    mrp: '599',
    price: '399',
  },
]

export async function seedSampleData() {
  if ((await db.products.count()) > 0) return { seeded: false }

  let variantCount = 0
  for (const s of SAMPLES) {
    const product = await createProduct(s.product)
    for (const size of s.sizes) {
      await createVariant({
        productId: product.id,
        sku: `${s.code}-${size}`,
        barcode: await generateBarcode(),
        size,
        costPaise: rupeesToPaise(s.cost),
        mrpPaise: rupeesToPaise(s.mrp),
        sellingPricePaise: rupeesToPaise(s.price),
        taxRatePercent: 5,
        reorderThreshold: 3,
        openingStock: 10,
      })
      variantCount += 1
    }
  }
  return { seeded: true, products: SAMPLES.length, variants: variantCount }
}
