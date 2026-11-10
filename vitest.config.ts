import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globalSetup: ["./tests/global-setup.ts"],
    // Tests share one SQLite file (and one audit hash chain), so run files sequentially.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "file:./test.db",
      SESSION_SECRET: "test-only-session-secret-0123456789abcdef",
      PAYMENTS_ADAPTER: "mock",
      MOCK_PAYMENTS_LOG: ".mock-payments.test.jsonl",
    },
  },
});
