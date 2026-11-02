import "dotenv/config";
import { passwordSchema } from "../auth/passwordPolicy.js";
import { hashPassword } from "../auth/passwords.js";
import { loadConfig } from "../config.js";
import { connectDatabase, disconnectDatabase } from "../db/connection.js";
import { initModels } from "../models/index.js";
import { User } from "../models/User.js";

// Creates the first admin from ADMIN_USERNAME and ADMIN_PASSWORD in .env.
// It does nothing if an admin already exists, so it is safe to run twice.
async function main() {
  const config = loadConfig();
  const username = (process.env.ADMIN_USERNAME ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error(
      "ADMIN_USERNAME must be 3-30 characters: letters, digits, dot, dash or underscore",
    );
  }
  const passwordCheck = passwordSchema.safeParse(password);
  if (!passwordCheck.success) {
    throw new Error(`ADMIN_PASSWORD: ${passwordCheck.error.issues[0].message}`);
  }

  await connectDatabase(config.mongoUri);
  await initModels();

  if (await User.exists({ role: "admin" })) {
    console.log("An admin already exists. Nothing was changed.");
    return;
  }

  await User.create({
    username,
    displayName: "Owner",
    role: "admin",
    passwordHash: await hashPassword(password, config.bcryptCost),
  });
  console.log(
    `Admin "${username}" created. You can now remove ADMIN_PASSWORD from .env.`,
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
