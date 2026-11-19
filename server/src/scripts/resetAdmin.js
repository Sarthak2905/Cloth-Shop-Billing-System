import "dotenv/config";
import { passwordSchema } from "../auth/passwordPolicy.js";
import { hashPassword } from "../auth/passwords.js";
import { loadConfig } from "../config.js";
import { connectDatabase, disconnectDatabase } from "../db/connection.js";
import { initModels } from "../models/index.js";
import { User } from "../models/User.js";

// Without RESET_PASSWORD it only LISTS the accounts (names and roles, never passwords).
// With RESET_USERNAME (the current name) and RESET_PASSWORD it sets a new password, and
// with NEW_USERNAME it also changes the username. Every old sign-in stops working.
async function main() {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  await initModels();

  const current = (process.env.RESET_USERNAME ?? "").trim().toLowerCase();
  const password = process.env.RESET_PASSWORD ?? "";
  const next = (process.env.NEW_USERNAME ?? "").trim().toLowerCase();

  if (!password) {
    const users = await User.find().sort({ createdAt: 1 });
    if (users.length === 0) {
      console.log("There are no accounts. Create one with: npm run seed:admin");
      return;
    }
    console.log("Accounts in this database:");
    for (const u of users) {
      console.log(
        `  ${u.username}  (${u.role}${u.active ? "" : ", disabled"})`,
      );
    }
    console.log(
      "\nTo reset one, set RESET_USERNAME and RESET_PASSWORD (and NEW_USERNAME to rename it).",
    );
    return;
  }

  if (!current)
    throw new Error("Set RESET_USERNAME to the account's current username");
  const check = passwordSchema.safeParse(password);
  if (!check.success) {
    throw new Error(`RESET_PASSWORD: ${check.error.issues[0].message}`);
  }
  if (next && !/^[a-z0-9._-]{3,30}$/.test(next)) {
    throw new Error(
      "NEW_USERNAME must be 3-30 characters: letters, digits, dot, dash or underscore",
    );
  }

  const user = await User.findOne({ username: current }).select(
    "+passwordHash",
  );
  if (!user) {
    throw new Error(
      `There is no account named "${current}". Run it without RESET_PASSWORD to see the names.`,
    );
  }
  if (next && next !== current && (await User.exists({ username: next }))) {
    throw new Error(
      `The username "${next}" is already used by another account`,
    );
  }

  if (next) user.username = next;
  user.passwordHash = await hashPassword(password, config.bcryptCost);
  user.failedLogins = 0;
  user.lockedUntil = null; // a reset also unlocks the account
  user.active = true;
  user.tokenVersion += 1; // every old sign-in stops working
  await user.save();

  console.log(
    `Done. Sign in as "${user.username}" with the new password. Every old sign-in is logged out.`,
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
