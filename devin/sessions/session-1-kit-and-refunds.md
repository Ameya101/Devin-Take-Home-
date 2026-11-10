# Session 1: Kit + Refunds app

Paste everything below into a new Devin session.

You are building a proof of concept for a Series C fintech (~60 engineers) that currently uses Microsoft Power Apps for internal tools (KYC review queue, refunds dashboard, feature-flag admin) and plans to build 10+ more. The goal is to show they can replace Power Apps with a shared internal-tools kit their engineers own, where most of the value is the governance layer (auth, roles, audit, approvals), not the screens.

Repo: Devin-Take-Home- (it only contains this devin/ folder of prompts and a README). Build the app at the repo root. Do not modify anything in devin/. Follow the Knowledge entries for this repo strictly. Keep the scope tight: this should take about an hour. Do not add features not listed here.

## Part A: Project setup
- Next.js App Router + TypeScript strict, Prisma with SQLite, Tailwind + shadcn/ui, Zod, Vitest.
- Scripts: dev, build, lint, typecheck, test, db:reset (prisma migrate reset --force + seed).
- .env.example with every variable documented.

## Part B: The kit (src/kit)
1. auth/
   - AuthProvider interface: getCurrentUser(), signIn(), signOut().
   - DevAuthProvider: /login page lists seeded users with their roles; picking one sets a signed, httpOnly session cookie (use iron-session or equivalent). Clearly labeled "DEV ONLY".
   - OidcAuthProvider: a stub with a TODO and comments showing where Entra ID / Okta config goes. Selected by AUTH_PROVIDER env var.
   - Middleware redirects unauthenticated users to /login.
2. rbac/
   - permissions.ts: central map of role -> permissions. Roles: viewer, support_agent, finance_approver, eng_admin, platform_admin.
   - can(user, permission) and withPermission(permission, handler) for server actions and route handlers. withPermission throws a 403 error and writes an "access_denied" audit event when it fails.
   - <Can permission="..."> component for UI hiding only (convenience, not security).
3. audit/
   - Prisma model AuditEvent: id, timestamp, actorId, actorEmail, action, entityType, entityId, before (JSON), after (JSON), metadata (JSON), prevHash, hash.
   - audit.record(tx, event): runs inside the caller's Prisma transaction. hash = sha256(prevHash + canonical JSON of the event). This makes the log tamper-evident.
   - audit.verifyChain(): recomputes the chain and reports the first broken row, if any.
   - /admin/audit page (platform_admin only): filterable table (actor, action, entity, date range), expandable row showing the before/after diff, a "Verify integrity" button, and CSV export.
4. approvals/
   - Prisma model ApprovalRequest: id, type, payload (JSON), status (pending|approved|rejected|executed|failed), requestedById, requestedAt, decidedById, decidedAt, decisionNote.
   - registerApprovalType(type, { permissionToApprove, execute(payload, tx) }).
   - requestApproval(), approve(), reject(). Enforce on the server: approver != requester, approver has the permission, request is still pending. On approve, run execute() in the same transaction and write audit events for request, decision, and execution.
   - /approvals page: "My requests" and "Waiting for me" tabs with approve/reject + note.
5. ui/
   - App shell: left nav built from all app manifests, filtered by the user's permissions; header shows current user + role and a sign-out button.
   - DataTable (sorting, filter, pagination), mask.ts (email, card last4, account numbers), formatMoney(cents, currency).
6. App registry: src/apps/registry.ts imports each app's manifest.ts ({ id, name, icon, basePath, navPermission, permissions[] }).

## Part C: Refunds app (src/apps/refunds)
- Prisma models: Customer (name, email), Payment (customerId, amountCents, currency, status, cardLast4, createdAt), Refund (paymentId, amountCents, reason, status: requested|pending_approval|processed|rejected, requestedById, approvalRequestId).
- PaymentsAdapter interface with a MockPaymentsAdapter (pretend Stripe call, logs and returns a fake refund id). This is where a real Stripe/Adyen integration would go.
- Pages:
  - /refunds: table of payments with search by customer, status filter, masked email and card.
  - /refunds/[paymentId]: payment detail, refund history, "Issue refund" form (amount, reason dropdown, note). Validate with Zod: amount > 0 and <= remaining refundable amount.
- Policy: refunds <= $500 by a support_agent are processed immediately. Refunds > $500 create an ApprovalRequest of type "refund.large" that a finance_approver (not the requester) must approve, which then calls the PaymentsAdapter. Put the threshold in a single config constant.
- Permissions: refunds.view, refunds.create, refunds.approve_large.
- Every write is audited per the Knowledge rules.

## Part D: Seed data
- Users: one per role (e.g. viewer@acme.test, agent@acme.test, agent2@acme.test, approver@acme.test, eng@acme.test, admin@acme.test).
- 25 customers, ~80 payments with realistic amounts ($5 to $4,000), a few existing refunds, and 2 pending large-refund approvals.

## Part E: Tests (minimum)
Vitest unit tests for: can()/withPermission denial, approver != requester rule, audit hash chain (verifyChain detects a tampered row), refund threshold routing.

## Done when
- `npm install && npm run db:reset && npm run dev` works from a clean clone.
- Logged in as agent@acme.test I can issue a $50 refund (processed) and a $900 refund (pending approval). As agent I cannot approve it. As approver@acme.test I can approve it, and the audit log shows the full chain with before/after values and "Verify integrity" passes.
- lint, typecheck and tests pass.
- Open a PR titled "Internal tools kit + Refunds app" with a short description of the architecture and a checklist of the "Done when" items you verified, with screenshots of the refunds page, the approvals page and the audit log.
- Also add docs/ADDING_AN_APP.md: the exact steps to add a new app on the kit (manifest, permissions, models, pages, audit, approvals, tests). Session 2 will follow this file.
