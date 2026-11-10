import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Runs the production build (`npm run build` first) against a freshly migrated + seeded SQLite file.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/prisma.mjs migrate reset --force && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:./e2e.db",
      AUTH_PROVIDER: "dev",
      ALLOW_DEV_AUTH_IN_PRODUCTION: "true",
      SESSION_SECRET: randomBytes(32).toString("base64"),
      MOCK_PAYMENTS_LOG: ".mock-payments.e2e.jsonl",
    },
  },
});
