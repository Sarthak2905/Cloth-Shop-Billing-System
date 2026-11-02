import { Router } from "express";
import { z } from "zod";
import { badRequest, conflict, notFound } from "../errors.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { passwordSchema } from "../auth/passwordPolicy.js";
import { hashPassword } from "../auth/passwords.js";
import { asyncHandler } from "../http/asyncHandler.js";
import { parse } from "../http/validate.js";
import { User, publicUser } from "../models/User.js";
import { audit } from "../services/audit.js";

const createSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore"),
    displayName: z.string().trim().min(1).max(60),
    password: passwordSchema,
    role: z.enum(["admin", "cashier"]),
  })
  .strict();

const updateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    role: z.enum(["admin", "cashier"]),
    active: z.boolean(),
    password: passwordSchema,
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

// Only admins manage accounts. There is no public sign-up anywhere.
export function usersRouter(config) {
  const router = Router();
  router.use(requireAuth(config), requireRole("admin"));

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const users = await User.find().sort({ createdAt: 1 });
      res.json({ users: users.map(publicUser) });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const data = parse(createSchema, req.body);
      if (await User.exists({ username: data.username })) {
        throw conflict("USERNAME_TAKEN", "That username is already in use");
      }

      const user = await User.create({
        username: data.username,
        displayName: data.displayName,
        role: data.role,
        passwordHash: await hashPassword(data.password, config.bcryptCost),
      });

      await audit(req, {
        action: "user.created",
        entity: "user",
        entityId: user._id,
        details: { username: user.username, role: user.role },
      });
      res.status(201).json({ user: publicUser(user) });
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const changes = parse(updateSchema, req.body);
      const target = await User.findById(req.params.id).select("+passwordHash");
      if (!target) throw notFound("User not found");

      // Stops an admin locking themselves (and so possibly everyone) out.
      const isSelf = target._id === req.user._id;
      if (
        isSelf &&
        (changes.active === false || (changes.role && changes.role !== "admin"))
      ) {
        throw badRequest(
          "You cannot disable or demote your own account",
          "CANNOT_MODIFY_SELF",
        );
      }

      const changed = [];
      let invalidateTokens = false;

      if (
        changes.displayName !== undefined &&
        changes.displayName !== target.displayName
      ) {
        target.displayName = changes.displayName;
        changed.push("displayName");
      }
      if (changes.role !== undefined && changes.role !== target.role) {
        target.role = changes.role;
        changed.push("role");
        invalidateTokens = true;
      }
      if (changes.active !== undefined && changes.active !== target.active) {
        target.active = changes.active;
        changed.push("active");
        if (changes.active === false) invalidateTokens = true;
        target.failedLogins = 0;
        target.lockedUntil = null;
      }
      if (changes.password !== undefined) {
        target.passwordHash = await hashPassword(
          changes.password,
          config.bcryptCost,
        );
        target.failedLogins = 0;
        target.lockedUntil = null; // a password reset also unlocks the account
        changed.push("password");
        invalidateTokens = true;
      }

      if (invalidateTokens) target.tokenVersion += 1;
      await target.save();

      await audit(req, {
        action: "user.updated",
        entity: "user",
        entityId: target._id,
        details: { username: target.username, changed },
      });
      res.json({ user: publicUser(target) });
    }),
  );

  return router;
}
