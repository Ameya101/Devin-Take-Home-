// Creates .env from .env.example on first install so a clean clone works out of the box.
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".env") && existsSync(".env.example")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}
