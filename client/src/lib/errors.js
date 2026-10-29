// One error type for all expected business/validation problems.
// `code` is machine-readable, `message` is human-readable.
export class AppError extends Error {
  constructor(code, message, details = []) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

// Turns a validation error into { fieldName: message } for showing under inputs.
export function fieldErrorsFrom(err) {
  const out = {}
  if (err instanceof AppError) {
    for (const d of err.details) {
      if (!out[d.field]) out[d.field] = d.message
    }
  }
  return out
}
