import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The first run downloads a temporary MongoDB, which can take several minutes.
    hookTimeout: 600_000,
    testTimeout: 30_000,
    // One test file at a time keeps the temporary databases from fighting each other.
    fileParallelism: false,
  },
});
