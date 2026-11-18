import "dotenv/config";
import { passwordSchema } from "../auth/passwordPolicy.js";
import { hashPassword } from "../auth/passwords.js";
import { loadConfig } from "../config.js";
import { connectDatabase, disconnectDatabase } from "../db/connection.js";
import { initModels } from "../models/index.js";
import { User } from "../models/User.js";

// Sets a new password for an existing user, and logs out every old sign-in.
// Run it with RESET_USERNAME and RESET_PASSWORD set (see the README line below).
async function main() {
  const config = loadConfig();
  const username = (process.env.RESET_USERNAME ?? "").trim().toLowerCase();
  const password = process.env.RESET_PASSWORD ?? "";

  if (!username) throw new Error("Set RESET_USERNAME to the user's name");
  const check = passwordSchema.safeParse(password);
  if (!check.success) {
    throw new Error(`RESET_PASSWORD: ${check.error.issues[0].message}`);
  }

  await connectDatabase(config.mongoUri);
  await initModels();

  const user = await User.findOne({ username }).select("+passwordHash");
  if (!user) throw new Error(`There is no user named "${username}"`);

  user.passwordHash = await hashPassword(password, config.bcryptCost);
  user.failedLogins = 0;
  user.lockedUntil = null; // a reset also unlocks the account
  user.tokenVersion += 1; // every old sign-in stops working
  await user.save();

  console.log(
    `Password changed for "${username}". Every old sign-in is logged out.`,
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
