# Playbook: New internal tool on the kit

Save this in Devin → Playbooks before Session 2.

Title: New internal tool on the kit

Overview
Build a new internal app on the shared kit in the Devin-Take-Home- repo, from a short product spec. The kit gives you auth, RBAC, audit logging and maker-checker approvals. Your job is the app's data model, pages and policies, wired into those primitives.

Procedure
1. Read docs/ADDING_AN_APP.md and an existing app (src/apps/refunds) before writing code.
2. Restate the spec as: entities, roles/permissions, which actions are sensitive (need approval), and what must be audited. Post this to me as a short plan and then continue without waiting unless something is truly ambiguous.
3. Add Prisma models and a migration. Money in integer minor units. Add seed data.
4. Create src/apps/<app>/manifest.ts and register permissions in src/kit/rbac/permissions.ts. Map them to existing roles; add a role only if the spec needs it.
5. Write server actions wrapped in withPermission. Validate input with Zod. Every mutation calls audit.record() in the same transaction.
6. For sensitive actions, register an approval type with registerApprovalType and route the action through requestApproval().
7. Build pages with the kit's AppShell and DataTable. Mask PII in lists.
8. Add unit tests for the app's policies (who can do what, which actions need approval) and one test proving a requester cannot approve their own request.
9. Run lint, typecheck, tests, and click through the golden path as two different seeded users.
10. Open a PR (from the session branch named in the prompt, into bazalu) with: the plan from step 2, screenshots, and the list of permissions and approval types added.

Specifications
- No new dependencies without saying why in the PR.
- No imports from other apps.
- No authorization logic in client components.

Advice and pointers
- If the kit is missing something the app needs, add it to the kit in a generic way with tests, and call it out in the PR. Do not work around the kit inside the app.

Forbidden actions
- Do not modify or delete existing audit events or migrations.
- Do not disable or skip tests.
