# Knowledge: Internal tools kit — architecture rules

Trigger: when working in the Devin-Take-Home- repo

This repo is a shared platform for internal tools at a regulated fintech. Every app is built on the kit in src/kit. Non-negotiable rules:

1. AuthZ is enforced on the server. Every server action and route handler that reads or writes data must be wrapped with withPermission(permission, handler) from src/kit/rbac. Hiding a button in the UI is never the access control.
2. Every mutation writes an audit event in the SAME database transaction as the change, using audit.record() from src/kit/audit. Include actor, action, entity type/id, before and after values. Never update or delete audit rows.
3. Sensitive actions go through maker-checker approvals (src/kit/approvals). The approver must be a different user from the requester, and this is enforced on the server.
4. Permissions are declared in each app's manifest.ts and registered in src/kit/rbac/permissions.ts. Roles map to permissions there, nowhere else.
5. Mask PII by default in lists (src/kit/ui/mask.ts). Show full values only on detail views behind a permission.
6. Money is stored as integer minor units (cents) with a currency code. Never use floats for money.
7. Each app lives in src/apps/<app-name>/ with a manifest.ts, server actions, and pages under src/app/(apps)/<app-name>/. Apps must not import from other apps, only from src/kit.
8. Add or update tests for any kit change. Run `npm run lint && npm run typecheck && npm test` before opening a PR.
