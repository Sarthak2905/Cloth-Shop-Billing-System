import rateLimit from "express-rate-limit";

export function createLimiter({ windowMs, limit }, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message:
            message ??
            "Too many requests. Please slow down and try again shortly.",
          requestId: req.id,
        },
      });
    },
  });
}
