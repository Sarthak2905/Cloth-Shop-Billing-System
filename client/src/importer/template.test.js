import { parseCsv } from './csv'
import { planImport } from './plan'
import { buildTemplateCsv, TEMPLATE_HEADERS } from './template'

test('the sample file has a UTF-8 marker and all the headings', () => {
  const text = buildTemplateCsv()

  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(parseCsv(text)[0]).toEqual(TEMPLATE_HEADERS)
})

test('the sample file is itself a valid import, with the same product and size twice', () => {
  const plan = planImport(parseCsv(buildTemplateCsv()), { products: [] })

  expect(plan.fatal).toBeNull()
  expect(plan.problems).toEqual([])
  expect(plan.ignoredColumns).toEqual([])
  expect(plan.ready).toHaveLength(5)
  expect(plan.summary.newProducts).toBe(3)
  expect(
    plan.ready.filter(
      (r) => r.variant.size === 'M' && r.product.name === "Men's Casual Shirt",
    ),
  ).toHaveLength(2)
})
