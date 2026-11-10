import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // Tests share one SQLite file (and one audit hash chain), so run files sequentially.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-only-session-secret-0123456789abcdef",
      PAYMENTS_ADAPTER: "mock",
    },
  },
});
