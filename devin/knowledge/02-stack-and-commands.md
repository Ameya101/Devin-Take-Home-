# Knowledge: Internal tools kit — stack and commands

Trigger: when working in the Devin-Take-Home- repo

Stack: Next.js (App Router, TypeScript strict), Prisma ORM, SQLite for local dev (Postgres via docker-compose for prod-like), Tailwind + shadcn/ui, Zod for input validation, Vitest for unit tests, Playwright for e2e.
Commands: npm run dev | npm run db:reset (migrate + seed) | npm test | npm run e2e | npm run lint | npm run typecheck.
Local auth is a dev login page that lets you pick a seeded user. Production auth is OIDC (Entra ID / Okta) behind the same AuthProvider interface in src/kit/auth.
Keep dependencies minimal. Prefer server components and server actions over client-side fetching.
