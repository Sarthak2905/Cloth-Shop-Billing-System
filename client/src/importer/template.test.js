import { parseCsv } from './csv'
import { planImport } from './plan'
import { buildTemplateCsv, TEMPLATE_HEADERS } from './template'

test('the sample file has a UTF-8 marker and all the headings', () => {
  const text = buildTemplateCsv()

  expect(text.charCodeAt(0)).toBe(0xfeff)
  expect(parseCsv(text)[0]).toEqual(TEMPLATE_HEADERS)
})

test('the sample file is itself a valid import', () => {
  const plan = planImport(parseCsv(buildTemplateCsv()), {
    products: [],
    variants: [],
  })

  expect(plan.fatal).toBeNull()
  expect(plan.problems).toEqual([])
  expect(plan.ready).toHaveLength(4)
  expect(plan.summary.newProducts).toBe(3)
})
