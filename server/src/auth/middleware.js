import { forbidden, unauthorized } from "../errors.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { User } from "../models/User.js";
import { verifyToken } from "./tokens.js";

// Reads "Authorization: Bearer <token>", then checks the user still exists, is
// active, and that the token has not been invalidated.
export function requireAuth(config) {
  return asyncHandler(async (req, res, next) => {
    const [scheme, token] = (req.get("authorization") ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized("Login required");

    let payload;
    try {
      payload = verifyToken(token, config);
    } catch {
      throw unauthorized("Your session has expired. Please log in again.");
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.active || user.tokenVersion !== payload.tv) {
      throw unauthorized(
        "Your session is no longer valid. Please log in again.",
      );
    }

    req.user = user;
    next();
  });
}

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) return next(forbidden());
    return next();
  };
