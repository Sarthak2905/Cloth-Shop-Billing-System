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
