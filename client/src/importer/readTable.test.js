import { readTable } from './readTable'

test('reads a CSV file through the text reader', async () => {
  const file = new File(['x'], 'products.csv')
  const rows = await readTable(file, { readText: async () => 'a,b\n1,2' })
  expect(rows).toEqual([
    ['a', 'b'],
    ['1', '2'],
  ])
})

test('reads an .xlsx file through the Excel reader', async () => {
  const file = new File(['x'], 'Products.XLSX')
  const readXlsx = vi.fn(async () => [['Product Name'], ['Shirt']])

  const rows = await readTable(file, { readXlsx })

  expect(readXlsx).toHaveBeenCalledWith(file)
  expect(rows).toEqual([['Product Name'], ['Shirt']])
})

test('an old .xls file gets a helpful message', async () => {
  await expect(readTable(new File(['x'], 'old.xls'))).rejects.toMatchObject({
    code: 'UNSUPPORTED_FILE',
    message: expect.stringContaining('.xlsx'),
  })
})

test('other file types are refused', async () => {
  await expect(readTable(new File(['x'], 'list.pdf'))).rejects.toMatchObject({
    code: 'UNSUPPORTED_FILE',
  })
})
