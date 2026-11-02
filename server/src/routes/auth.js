import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppError, unauthorized } from "../errors.js";
import { requireAuth } from "../auth/middleware.js";
import { passwordSchema } from "../auth/passwordPolicy.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { signToken } from "../auth/tokens.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { createLimiter } from "../http/rateLimiter.js";
import { parse } from "../http/validate.js";
import { User, publicUser } from "../models/User.js";
import { audit } from "../services/audit.js";

const loginSchema = z
  .object({
    username: z.string().trim().min(1).max(60),
    password: z.string().min(1).max(200),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: passwordSchema,
  })
  .strict();

export function authRouter(config) {
  const router = Router();
  const loginLimiter = createLimiter(
    config.loginRateLimit,
    "Too many login attempts. Please try again later.",
  );
  const authenticate = requireAuth(config);
  let dummyHash = null;

  // Spends the same time a real password check would, so the response time does
  // not reveal whether a username exists.
  async function burnTime(password) {
    dummyHash ??= await hashPassword(randomUUID(), config.bcryptCost);
    await verifyPassword(password, dummyHash);
  }

  router.post(
    "/login",
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { username, password } = parse(loginSchema, req.body);
      const name = username.toLowerCase();
      const user = await User.findOne({ username: name }).select(
        "+passwordHash",
      );
      const now = new Date();

      const reject = async (reason) => {
        await audit(req, {
          actor: null,
          action: "login.failed",
          entity: "user",
          entityId: user?._id ?? "",
          details: { username: name, reason },
        });
        throw unauthorized("Invalid username or password");
      };

      if (!user || !user.active) {
        await burnTime(password);
        return reject(user ? "account disabled" : "unknown user");
      }

      if (user.lockedUntil && user.lockedUntil > now) {
        const minutes = Math.max(
          1,
          Math.ceil((user.lockedUntil - now) / 60000),
        );
        throw new AppError(
          429,
          "ACCOUNT_LOCKED",
          `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        );
      }

      if (!(await verifyPassword(password, user.passwordHash))) {
        user.failedLogins += 1;
        if (user.failedLogins >= config.lockout.maxFailures) {
          user.lockedUntil = new Date(
            now.getTime() + config.lockout.minutes * 60000,
          );
          user.failedLogins = 0;
          await audit(req, {
            actor: user,
            action: "account.locked",
            entity: "user",
            entityId: user._id,
          });
        }
        await user.save();
        return reject("wrong password");
      }

      user.failedLogins = 0;
      user.lockedUntil = null;
      user.lastLoginAt = now;
      await user.save();

      await audit(req, {
        actor: user,
        action: "login.succeeded",
        entity: "user",
        entityId: user._id,
      });
      res.json({ token: signToken(user, config), user: publicUser(user) });
    }),
  );

  router.get("/me", authenticate, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.post(
    "/change-password",
    authenticate,
    asyncHandler(async (req, res) => {
      const { currentPassword, newPassword } = parse(
        changePasswordSchema,
        req.body,
      );
      const user = await User.findById(req.user._id).select("+passwordHash");

      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new AppError(
          400,
          "WRONG_PASSWORD",
          "Your current password is not correct",
        );
      }
      if (newPassword === currentPassword) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "The new password must be different",
          [{ field: "newPassword", message: "Choose a different password" }],
        );
      }

      user.passwordHash = await hashPassword(newPassword, config.bcryptCost);
      user.tokenVersion += 1; // logs out every other session
      await user.save();

      await audit(req, {
        action: "password.changed",
        entity: "user",
        entityId: user._id,
      });
      res.json({ token: signToken(user, config), user: publicUser(user) });
    }),
  );

  return router;
}
