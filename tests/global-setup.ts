import { execSync } from "node:child_process";

/** Recreates the test SQLite database (prisma/test.db) from migrations before the run. */
export default function setup() {
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
