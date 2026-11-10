# Session 3: Forward-deployed-engineer hardening

Paste everything below into a new Devin session after Sessions 1 and 2 are merged.

Git workflow for this session: work only on the existing branch `session-3`. Before writing code, run `git fetch origin && git checkout session-3 && git merge origin/bazalu` so it includes everything merged so far. Push all commits to `session-3` and open (or update) a pull request from `session-3` into `bazalu`. Do not push to `bazalu` directly.

Act as a forward deployed engineer getting the Devin-Take-Home- repo ready to hand over to a client's platform team. The client is a regulated fintech; their security team and a SOC 2 auditor will read this repo. Keep each change small and focused. Do not add new product features. Target about 30 minutes.

1. Security pass
   - Add a test that loads every server action and route handler and fails if any mutating one is not wrapped in withPermission. This is the guardrail that makes 10+ more apps safe to build.
   - Confirm every Zod-validated input rejects unexpected fields. Confirm session cookies are httpOnly, secure in production, sameSite=lax.
   - Add security headers (CSP, X-Frame-Options, Referrer-Policy) via Next.js config.
   - Run `npm audit` and fix high/critical issues where it's a safe upgrade. List any you left in the PR.
2. Tests
   - Fill gaps in unit tests for the kit (target: every exported function in src/kit has at least one test).
   - Playwright e2e for the two golden paths: (a) agent requests a large refund, approver approves, audit chain verifies; (b) eng_admin changes a prod flag, a second eng_admin approves.
3. CI
   - GitHub Actions workflow on PRs: install, lint, typecheck, unit tests, build, e2e against SQLite. Cache dependencies.
4. Production-like run
   - Dockerfile (multi-stage, non-root user) and docker-compose.yml with Postgres. Make the Prisma datasource switch via DATABASE_URL. `docker compose up` should migrate, seed and start the app.
5. Observability
   - Structured JSON logging with a request id. A /api/health endpoint that checks the DB.
6. Documentation
   - README: what this is (one paragraph), architecture diagram (Mermaid: kit layers, apps, DB, auth provider, payments adapter), quick start (local and Docker), demo script (which user to log in as and what to click), how to add an app (link docs/ADDING_AN_APP.md), and a "Production gaps" section listing honestly what is NOT production-ready (OIDC is a stub, mock payments adapter, no data retention policy, no SIEM export, no backups, no per-environment deploy pipeline, no load testing).
   - docs/adr/: three short ADRs (context, decision, consequences): 001 server-side RBAC via withPermission, 002 hash-chained audit log in the app DB vs external log store, 003 maker-checker as a kit primitive.
7. Open the PR from session-3 titled "Hardening for handover" with a summary table of what changed and what remains in Production gaps.
