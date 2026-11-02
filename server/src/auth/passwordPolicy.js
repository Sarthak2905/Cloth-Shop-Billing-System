import { z } from "zod";

// bcrypt only uses the first 72 bytes, so longer passwords would be silently cut.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");
