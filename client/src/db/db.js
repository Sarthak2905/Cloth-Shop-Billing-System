import Dexie from 'dexie'

export const db = new Dexie('clothing_pos')

// Schema strings list only INDEXED fields (fields we search/sort by).
// Other fields are still stored; they just aren't indexed.
// "&" = unique. "[a+b+c]" = compound index.
db.version(1).stores({
  products: 'id, name, category, brand, status, updatedAt',
  variants: 'id, productId, &barcode, &sku, status, &[productId+size+colour]',
  sales: 'id, &invoiceNumber, createdAt, status, syncStatus',
  saleItems: 'id, saleId, variantId',
  stockMovements: 'id, variantId, type, createdAt, referenceId',
  settings: 'key',
  syncQueue: 'id, status, createdAt',
})
