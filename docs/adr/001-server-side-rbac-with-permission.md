# ADR 001: Server-side RBAC through `withPermission`

## Context
Power Apps hides controls per role, but hiding a button doesn't stop a crafted request. A regulated fintech needs authorization that is enforced on the server, logged when it denies access, and easy to review across 10+ apps written by different teams.

## Decision
- Roles map to permissions in one file, `src/kit/rbac/permissions.ts`. Apps declare their permissions in their manifest.
- Every server action, route handler and data loader is wrapped in `withPermission(permission, handler)`. It loads the current user server-side, checks `can(user, permission)`, and on failure writes an `access_denied` audit event and throws a 403.
- `<Can>` exists only to hide UI; it is never the security boundary.
- A guardrail test (`src/security.test.ts`) imports every `"use server"` module and every `route.ts` and fails if any export runs for an anonymous caller. Exceptions (sign-in, sign-out, health check) are listed explicitly in the test.

## Consequences
- Reviewers check one pattern instead of reading each handler's logic, and the test catches a forgotten wrapper before merge.
- Permissions are coarse (role → permission), not attribute-based. Row-level rules (e.g. requester ≠ approver) live in the services and need their own tests.
- Changing a role's access is a code change and goes through PR review, which is usually what an auditor wants.
