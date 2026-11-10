#!/bin/sh
set -e
if [ -z "$SESSION_SECRET" ]; then
  SESSION_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
  export SESSION_SECRET
  echo '{"level":"warn","msg":"SESSION_SECRET not set; generated an ephemeral one (sessions reset on restart)"}'
fi
node scripts/prisma.mjs migrate deploy
if [ "$SEED_IF_EMPTY" = "true" ]; then npx tsx prisma/seed.ts; fi
exec npx next start -p "${PORT:-3000}"
