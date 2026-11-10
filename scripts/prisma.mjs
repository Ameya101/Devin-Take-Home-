// Runs the Prisma CLI against the schema matching DATABASE_URL:
// postgres://... -> prisma/postgres/schema.prisma, anything else -> prisma/schema.prisma (SQLite).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

if (!process.env.DATABASE_URL && existsSync(".env")) {
  const line = readFileSync(".env", "utf8").match(/^DATABASE_URL=(.*)$/m);
  if (line) process.env.DATABASE_URL = line[1].trim().replace(/^"|"$/g, "");
}
const postgres = /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? "");
const schema = postgres ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma";
const result = spawnSync("npx", ["prisma", ...process.argv.slice(2), "--schema", schema], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
