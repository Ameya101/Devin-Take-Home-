import { execSync } from "node:child_process";

/** Recreates the test database from migrations before the run: prisma/test.db, or TEST_DATABASE_URL (e.g. Postgres). */
export default function setup() {
  execSync("node scripts/prisma.mjs migrate reset --force --skip-seed --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "file:./test.db" },
  });
}
