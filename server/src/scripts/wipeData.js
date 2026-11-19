import "dotenv/config";
import mongoose from "mongoose";
import { loadConfig } from "../config.js";
import { connectDatabase, disconnectDatabase } from "../db/connection.js";
import { AuditLog } from "../models/AuditLog.js";
import { Counter } from "../models/Counter.js";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { Settings } from "../models/Settings.js";
import { StockMovement } from "../models/StockMovement.js";
import { User } from "../models/User.js";
import { Variant } from "../models/Variant.js";

// Permanently deletes the shop's data (products, items, stock records, bills, number
// counters and the audit log) from the database in MONGODB_URI. Users and shop settings are
// kept, unless WIPE_ALL=yes. Nothing is deleted until WIPE_CONFIRM is set to the database
// name, so a first run is always a harmless "dry run".
async function main() {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  const name = mongoose.connection.name;
  const everything = process.env.WIPE_ALL === "yes";

  const targets = [
    ["products", Product],
    ["items", Variant],
    ["stock records", StockMovement],
    ["bills", Sale],
    ["number counters", Counter],
    ["audit log entries", AuditLog],
    ...(everything
      ? [
          ["settings", Settings],
          ["users", User],
        ]
      : []),
  ];

  console.log(`Database: ${name}`);
  for (const [label, model] of targets) {
    console.log(`  ${label}: ${await model.countDocuments()}`);
  }
  if (!everything) console.log("  (users and shop settings are kept)");

  if (process.env.WIPE_CONFIRM !== name) {
    console.log(
      `\nDRY RUN: nothing was deleted.\nTo delete this permanently, set WIPE_CONFIRM to "${name}" and run it again.`,
    );
    return;
  }

  for (const [label, model] of targets) {
    const result = await model.deleteMany({});
    console.log(`Deleted ${result.deletedCount} ${label}`);
  }
  console.log(
    everything
      ? "\nDone. Everything is deleted. Create the admin again with: npm run seed:admin"
      : "\nDone. The shop data is deleted. Users and settings were kept.",
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
