# Adding an app on the kit

This is the exact checklist for adding a new internal tool (example: a `kyc` review queue).
The Refunds app (`src/apps/refunds`) is the reference implementation; copy its shape.

The rules in short: authorization on the server (`withPermission`), every write audited in the
same transaction (`audit.record`), sensitive actions through maker-checker (`requestApproval`),
PII masked in lists, money in integer minor units, apps import only from `src/kit` (never from other apps).

## 1. Create the app folder and manifest

```
src/apps/kyc/
  manifest.ts      # id, name, icon, basePath, navPermission, permissions
  config.ts        # policy constants (thresholds, enums)
  policy.ts        # pure functions: who/what/when (easy to unit test)
  schema.ts        # Zod schemas for every input
  service.ts       # domain writes; each runs in a transaction and calls audit.record
  queries.ts       # data loaders wrapped in withPermission
  actions.ts       # "use server" actions wrapped in withPermission
  approvals.ts     # registerApprovalType(...) for sensitive actions (if any)
  components/      # app-specific client components (no auth logic in here)
  kyc.test.ts
```

`src/apps/kyc/manifest.ts`:

```ts
import { defineManifest } from "@/kit/manifest";

export const kycManifest = defineManifest({
  id: "kyc",
  name: "KYC review",
  icon: "shield",                 // a key of ICONS in src/kit/ui/icons.ts (add one there if needed)
  basePath: "/kyc",
  navPermission: "kyc.view",
  permissions: ["kyc.view", "kyc.decide", "kyc.override"],
});
```

## 2. Register the app

1. `src/apps/registry.ts`: add the manifest to `apps`. This puts it in the left nav (filtered by
   `navPermission`) and makes its permissions part of the `Permission` type.
2. `src/kit/rbac/permissions.ts`: map the new permissions to roles in `ROLE_PERMISSIONS`. This is the
   only place roles map to permissions. Add a new role to `ROLES` only if the spec really needs one.
   The test in `src/kit/rbac/with-permission.test.ts` fails if a role is given an undeclared permission.

## 3. Data model

1. Add models to `prisma/schema.prisma` under a `// <App> app` section. SQLite has no enums: use
   `String` with a `/// a | b | c` doc comment and validate values with Zod. Money is `Int` minor
   units plus a `currency` string.
2. Create a migration: `npx prisma migrate dev --name add_kyc`. Never edit or delete existing migrations.
3. Add seed data to `prisma/seed.ts`. Create domain records that represent past *actions* through your
   service functions so they appear in the audit chain (see how refunds are seeded).
4. `npm run db:reset` and check the seed output ends with `audit chain ok=true`.

## 4. Reads: queries wrapped in withPermission

```ts
// src/apps/kyc/queries.ts
export const listCases = withPermission("kyc.view", async (user, filters: CaseFilters) =>
  prisma.kycCase.findMany({ where: ..., orderBy: { createdAt: "desc" } }),
);
```

In pages, call loaders through `orForbidden(...)` so a 403 renders `/forbidden` (and is audited):

```ts
const cases = await orForbidden(listCases({ status }));
```

## 5. Writes: service + server action

Service functions take the acting `SessionUser`, open a transaction, validate against live data,
write, and call `audit.record(tx, ...)` with `before` and `after` in the **same** transaction:

```ts
export async function decideCase(user: SessionUser, input: DecideInput) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.kycCase.findUniqueOrThrow({ where: { id: input.caseId } });
    const after = await tx.kycCase.update({ where: { id: before.id }, data: { status: input.decision } });
    await audit.record(tx, { actor: user, action: "kyc.decided", entityType: "KycCase", entityId: after.id, before, after });
    return after;
  });
}
```

Server actions live in `actions.ts` (`"use server"`), parse input with Zod, and are wrapped in
`withPermission`. Use `runAction` so expected errors (403, validation, conflicts) come back as a
message for `useActionState` instead of a crash:

```ts
"use server";
import "@/apps/approval-types"; // only if the action can trigger approvals

const decide = withPermission("kyc.decide", async (user, formData: FormData) => {
  const input = decideSchema.parse({ caseId: formData.get("caseId"), decision: formData.get("decision") });
  await decideCase(user, input);
  revalidatePath(`/kyc/${input.caseId}`);
  return "Decision saved";
});

export async function decideAction(_prev: ActionState, formData: FormData) {
  return runAction(() => decide(formData));
}
```

Per-record history: `loadEntityHistory(entityType, entityId)` from `@/kit/audit/queries` returns that
entity's audit events (newest first). It is not permission-checked, so call it from your own loader
wrapped in `withPermission` with the app's view permission (see `src/apps/flags/queries.ts`).

Route handlers: wrap with `withPermission` and adapt with `toRouteHandler` (see
`src/app/(kit)/admin/audit/export/route.ts`).

## 6. Sensitive actions: maker-checker approvals

1. Add a constant for the type (e.g. `KYC_OVERRIDE_APPROVAL = "kyc.override"`) in `config.ts`.
2. In `approvals.ts`, register it:

   ```ts
   registerApprovalType<OverridePayload>(KYC_OVERRIDE_APPROVAL, {
     permissionToApprove: "kyc.override",
     describe: (p) => `Override case …${p.caseId.slice(-6)} to ${p.decision}`,
     execute: (p, tx, { approver }) => applyOverride(tx, p, approver), // must audit its own writes
     onReject: (p, tx, { approver }) => markOverrideRejected(tx, p, approver),
     onFailure: (p, tx, { approver, error }) => releaseOverride(tx, p, approver, error), // optional; release reservations only if `error` proves nothing happened externally
   });
   ```

   Set `urgent: true` on a type whose requests must jump the queue (e.g. a kill switch): its requests
   are stored with `urgent = true`, listed first in "Waiting for me" and badged URGENT.

3. Add `import "./kyc/approvals";` to `src/apps/approval-types.ts`.
4. In the service, instead of writing directly, call `requestApproval(tx, { type, payload, requestedBy: user })`
   inside the same transaction as any "pending" domain row.

The kit enforces on the server: approver != requester, approver has `permissionToApprove`, request
still `pending`. `execute()` runs in the approval transaction; if it throws, the request is marked
`failed`. Requests appear automatically on `/approvals` ("My requests" / "Waiting for me").

## 7. Pages

Pages go in `src/app/(apps)/kyc/` (the `(apps)` layout wraps them in the kit `AppShell`).

- Lists: `DataTable` from `@/kit/ui/data-table`. Build `cells` on the server and mask PII there with
  `maskEmail` / `maskCard` / `maskAccountNumber` from `@/kit/ui/mask`. Format money with `formatMoney(cents, currency)`.
- Detail views may show full PII only behind a permission check (`can(user, "...")`).
- Use `<Can permission="...">` to hide buttons the user can't use. This is UI only; the server action
  must still be wrapped in `withPermission`.
- No authorization logic in client components.

## 8. Tests

Add `src/apps/kyc/kyc.test.ts` (Vitest runs against a fresh SQLite `prisma/test.db`). At minimum:

- policy functions (thresholds, routing, state transitions);
- a role without the permission is denied (see `src/kit/rbac/with-permission.test.ts` for mocking the current user);
- if you registered an approval type: the requester cannot approve their own request, and a different
  approver can (see `src/apps/refunds/refunds.test.ts`).

## 9. Verify and open the PR

```bash
npm run lint && npm run typecheck && npm test
npm run db:reset && npm run dev
```

Click the golden path as two different seeded users, then check `/admin/audit` (as `admin@acme.test`):
your actions appear with before/after values and **Verify integrity** passes.
In the PR list the permissions and approval types you added, and any dependency you introduced and why.
