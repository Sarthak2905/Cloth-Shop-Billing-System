import { createPrinter } from './printerFactory'

test('the browser choice gives the Windows printer', () => {
  expect(createPrinter('browser').id).toBe('browser')
})

test('simulated choices behave as the matching simulated printer', async () => {
  expect(createPrinter('simulated:ok').id).toBe('simulated')
  await expect(
    createPrinter('simulated:paper_out').print({}),
  ).rejects.toMatchObject({
    code: 'PAPER_OUT',
  })
  await expect(
    createPrinter('simulated:offline').print({}),
  ).rejects.toMatchObject({
    code: 'PRINTER_OFFLINE',
  })
})

test('an unknown choice falls back to the safe simulated printer', async () => {
  const printer = createPrinter('something-else')
  expect(printer.id).toBe('simulated')
  await expect(printer.print({})).resolves.toEqual({
    confirmation: 'simulated',
  })
})
