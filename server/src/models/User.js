import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9._-]+$/,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    // Never returned by default. Login asks for it explicitly with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "cashier"], required: true },
    active: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = mongoose.models.User ?? mongoose.model("User", userSchema);

// The only shape of a user that is ever sent to a client.
export function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}
