// An error that is safe to show to the client: it has a status, a code and a message.
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, code = "BAD_REQUEST", details) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = "Login required") =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have permission to do this") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") =>
  new AppError(404, "NOT_FOUND", message);
export const conflict = (code, message, details) =>
  new AppError(409, code, message, details);
