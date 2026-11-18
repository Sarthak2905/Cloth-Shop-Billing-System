import Dexie from 'dexie'

export const db = new Dexie('clothing_pos')

// Schema strings list only INDEXED fields (fields we search/sort by).
// Other fields are still stored; they just aren't indexed.
// "&" = unique. "[a+b+c]" = compound index.
db.version(1).stores({
  products: 'id, name, category, brand, status, updatedAt',
  variants: 'id, productId, &barcode, &sku, status, &[productId+size]',
  sales: 'id, &invoiceNumber, createdAt, status, syncStatus',
  saleItems: 'id, saleId, variantId',
  stockMovements: 'id, variantId, type, createdAt, referenceId',
  settings: 'key',
  syncQueue: 'id, status, createdAt',
})

// Version 2: adds the print job log. Version 1 above is never edited.
db.version(2).stores({
  printJobs: 'id, saleId, status, createdAt',
})

// Version 3: stock entries. The same product and size can now be entered any number
// of times, so SKU and "product + size" are no longer unique. Only the barcode is.
db.version(3).stores({
  variants: 'id, productId, &barcode, sku, [productId+size], status, createdAt',
})

// Version 4: bills can be saved before they are paid, so the payment status is indexed
// ('pending' = waiting for payment). Older bills simply have no payment status.
db.version(4).stores({
  sales: 'id, &invoiceNumber, createdAt, status, syncStatus, paymentStatus',
})

// Version 5: bills whose payment or cancellation still has to be sent to the server.
// `paymentPending` / `cancelPending` are 1 while something is waiting, and absent otherwise.
db.version(5).stores({
  sales:
    'id, &invoiceNumber, createdAt, status, syncStatus, paymentStatus, paymentPending, cancelPending',
})
