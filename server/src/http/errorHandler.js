import { AppError } from "../errors.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found", requestId: req.id },
  });
}

// Every error leaves the server in the same shape. Unexpected errors are logged
// here but never sent to the client (no stack traces, no database messages).
export function errorHandler(logger = console) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    const send = (status, code, message, details) =>
      res.status(status).json({
        error: {
          code,
          message,
          ...(details ? { details } : {}),
          requestId: req.id,
        },
      });

    if (err instanceof AppError)
      return send(err.status, err.code, err.message, err.details);
    if (err?.type === "entity.parse.failed") {
      return send(400, "INVALID_JSON", "The request body is not valid JSON");
    }
    if (err?.type === "entity.too.large") {
      return send(413, "PAYLOAD_TOO_LARGE", "The request is too large");
    }
    if (err?.code === 11000) {
      return send(
        409,
        "DUPLICATE_VALUE",
        "That value is already in use",
        Object.keys(err.keyPattern ?? {}),
      );
    }
    if (err?.name === "ValidationError" && err.errors) {
      return send(
        400,
        "VALIDATION_ERROR",
        "Some fields are invalid",
        Object.entries(err.errors).map(([field, e]) => ({
          field,
          message: e.message,
        })),
      );
    }

    logger.error(`[${req.id}]`, err);
    return send(500, "INTERNAL_ERROR", "Something went wrong on the server");
  };
}
