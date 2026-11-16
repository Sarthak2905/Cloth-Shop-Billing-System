const squash = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

// Two entries belong to the same product card when name, category and company match,
// ignoring capitals and extra spaces.
export const productKey = (name, category, brand) =>
  [squash(name), squash(category), squash(brand)].join('|')
