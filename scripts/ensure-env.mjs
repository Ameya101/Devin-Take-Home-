// Creates .env from .env.example on first install so a clean clone works out of the box,
// with a freshly generated SESSION_SECRET (the example value is public).
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (!existsSync(".env") && existsSync(".env.example")) {
  const secret = randomBytes(32).toString("base64");
  const env = readFileSync(".env.example", "utf8").replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET="${secret}"`);
  writeFileSync(".env", env);
  console.log("Created .env from .env.example with a random SESSION_SECRET");
}
