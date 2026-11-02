import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { connectDatabase, disconnectDatabase } from "./db/connection.js";
import { initModels } from "./models/index.js";

async function main() {
  const config = loadConfig();

  await connectDatabase(config.mongoUri);
  await initModels();
  console.log("Connected to MongoDB");

  const app = createApp(config);
  const server = app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("The server could not start:");
  console.error(err.message);
  process.exit(1);
});
