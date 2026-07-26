import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests share one Postgres test DB and truncate between
    // files, so they can't run as separate parallel worker processes.
    fileParallelism: false,
  },
});
