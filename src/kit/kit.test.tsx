import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/kit/auth/current-user", () => ({ getCurrentUser: vi.fn(), requireUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/refunds",
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { makeUser } from "../../tests/helpers";
import { decideApprovalAction } from "./approvals/actions";
import { DecisionForm } from "./approvals/decision-form";
import { listMyRequests } from "./approvals/queries";
import { approvalTypesApprovableBy, describeApproval, getApprovalType, registerApprovalType } from "./approvals/registry";
import { requestApproval } from "./approvals/service";
import { runAction } from "./actions";
import { verifyIntegrityAction } from "./audit/actions";
import { audit, computeHash, GENESIS_HASH, hashedFieldsOf, verifyRows } from "./audit/audit";
import { toJson } from "./audit/canonical";
import { auditEventsToCsv } from "./audit/csv";
import { DiffView } from "./audit/diff-view";
import { listAllAuditEvents, listAuditEvents, loadEntityHistory, parseAuditFilters } from "./audit/queries";
import { VerifyIntegrityButton } from "./audit/verify-button";
import { getCurrentUser, requireUser } from "./auth/current-user";
import { assertDevAuthAllowed, DevAuthProvider } from "./auth/dev-provider";
import { getAuthProvider } from "./auth/index";
import { OidcAuthProvider } from "./auth/oidc-provider";
import { SESSION_COOKIE } from "./auth/session";
import { toSessionUser } from "./auth/user";
import { dbProvider, prisma } from "./db";
import { ConflictError, ForbiddenError, KitError, NotFoundError, ValidationError } from "./errors";
import { log, logger, REQUEST_ID_HEADER } from "./log";
import { defineManifest } from "./manifest";
import { assertCan, denyAccess } from "./rbac/assert";
import { Can } from "./rbac/Can";
import { toRouteHandler } from "./rbac/http";
import { orForbidden } from "./rbac/page";
import { isRole, KIT_PERMISSIONS, permissionsFor, ROLES } from "./rbac/permissions";
import { AppShell } from "./ui/app-shell";
import { DataTable } from "./ui/data-table";
import { formatDateTime } from "./ui/format";
import { ICONS } from "./ui/icons";
import { maskAccountNumber } from "./ui/mask";
import { formatMoney, parseToMinorUnits } from "./ui/money";
import { navFor } from "./ui/nav";
import { NavLink } from "./ui/nav-link";
import { PageHeader } from "./ui/page-header";
import { StatusBadge } from "./ui/status-badge";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("errors, actions, manifest, db", () => {
  it("KitError subclasses carry HTTP status and code", () => {
    expect(new ForbiddenError()).toMatchObject({ status: 403, code: "forbidden", name: "ForbiddenError" });
    expect(new NotFoundError()).toMatchObject({ status: 404, code: "not_found" });
    expect(new ConflictError("x")).toMatchObject({ status: 409 });
    expect(new ValidationError("x")).toMatchObject({ status: 400 });
    expect(new NotFoundError()).toBeInstanceOf(KitError);
  });

  it("runAction maps kit and zod errors to results and rethrows the rest", async () => {
    await expect(runAction(async () => "done")).resolves.toEqual({ ok: true, message: "done" });
    await expect(runAction(async () => { throw new ConflictError("busy"); })).resolves.toEqual({ ok: false, error: "busy" });
    const { z } = await import("zod");
    await expect(runAction(async () => { z.string().parse(1); return ""; })).resolves.toMatchObject({ ok: false });
    await expect(runAction(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  it("defineManifest returns the manifest unchanged and dbProvider follows DATABASE_URL", () => {
    const m = { id: "x", name: "X", icon: "flag", basePath: "/x", navPermission: "x.view", permissions: ["x.view"] } as const;
    expect(defineManifest(m)).toBe(m);
    expect(dbProvider).toBe(process.env.DATABASE_URL?.startsWith("postgres") ? "postgresql" : "sqlite");
  });
});

describe("logging", () => {
  it("writes one JSON line per event (silent in tests unless LOG_IN_TESTS)", async () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await logger.info("quiet");
    expect(spy).not.toHaveBeenCalled();
    vi.stubEnv("LOG_IN_TESTS", "true");
    await log("info", "hello", { a: 1 });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ level: "info", msg: "hello", a: 1 });
    vi.unstubAllEnvs();
    spy.mockRestore();
  });
});

describe("auth", () => {
  it("toSessionUser validates the role; isRole/permissionsFor/ROLES/KIT_PERMISSIONS", () => {
    const row = { id: "1", email: "a@b", name: "A", role: "viewer", createdAt: new Date() };
    expect(toSessionUser(row)).toEqual({ id: "1", email: "a@b", name: "A", role: "viewer" });
    expect(() => toSessionUser({ ...row, role: "root" })).toThrow(/unknown role/);
    expect(ROLES).toContain("eng_admin");
    expect(isRole("viewer")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(permissionsFor("platform_admin")).toEqual(expect.arrayContaining([...KIT_PERMISSIONS]));
  });

  it("getAuthProvider picks by AUTH_PROVIDER; dev is refused in production; OIDC is a stub", async () => {
    expect(getAuthProvider()).toBeInstanceOf(DevAuthProvider);
    vi.stubEnv("AUTH_PROVIDER", "oidc");
    const oidc = getAuthProvider();
    expect(oidc).toBeInstanceOf(OidcAuthProvider);
    await expect(oidc.getCurrentUser()).resolves.toBeNull();
    await expect(oidc.signIn({})).rejects.toThrow(/not implemented/);
    vi.stubEnv("AUTH_PROVIDER", "saml");
    expect(() => getAuthProvider()).toThrow(/Unknown AUTH_PROVIDER/);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertDevAuthAllowed()).toThrow(/refused in production/);
    vi.stubEnv("ALLOW_DEV_AUTH_IN_PRODUCTION", "true");
    expect(() => assertDevAuthAllowed()).not.toThrow();
    vi.unstubAllEnvs();
    expect(SESSION_COOKIE).toBe("itk_session");
  });

  it("requireUser/getCurrentUser are the per-request entry points (mocked here)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(requireUser).mockResolvedValue({ id: "u", email: "e", name: "n", role: "viewer" });
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(requireUser()).resolves.toMatchObject({ role: "viewer" });
  });
});

describe("rbac helpers", () => {
  it("assertCan passes allowed users through; denyAccess audits and throws", async () => {
    const agent = await makeUser("support_agent");
    await expect(assertCan(agent, "refunds.create")).resolves.toBe(agent);
    await expect(assertCan(agent, "audit.view")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(denyAccess(agent, "audit.view", { reason: "test" })).rejects.toBeInstanceOf(ForbiddenError);
    const last = await prisma.auditEvent.findFirstOrThrow({ where: { actorId: agent.id, action: "access_denied" }, orderBy: { id: "desc" } });
    expect(last.metadata).toMatchObject({ reason: "test", permission: "audit.view" });
  });

  it("toRouteHandler turns kit errors into HTTP responses; orForbidden redirects on 403", async () => {
    const res = await toRouteHandler(async () => { throw new NotFoundError(); })();
    expect(res.status).toBe(404);
    expect((await toRouteHandler(async () => new Response("ok"))()).status).toBe(200);
    await expect(orForbidden(Promise.reject(new ForbiddenError()))).rejects.toThrow("redirect:/forbidden");
    await expect(orForbidden(Promise.resolve(1))).resolves.toBe(1);
  });

  it("<Can> renders children only with the permission", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u", email: "e", name: "n", role: "viewer" });
    expect(html(await Can({ permission: "refunds.view", children: "yes" }))).toBe("yes");
    expect(html(await Can({ permission: "refunds.create", children: "yes", fallback: "no" }))).toBe("no");
  });
});

describe("approvals helpers", () => {
  registerApprovalType<{ n: number }>("kit.test", { permissionToApprove: "refunds.approve_large", describe: (p) => `n=${p.n}`, execute: async () => null });

  it("registry lookups", () => {
    expect(getApprovalType("kit.test").permissionToApprove).toBe("refunds.approve_large");
    expect(() => getApprovalType("nope")).toThrow(/Unknown approval type/);
    expect(describeApproval("kit.test", { n: 2 })).toBe("n=2");
    expect(describeApproval("nope", { a: 1 })).toBe('{"a":1}');
    expect(approvalTypesApprovableBy({ id: "u", email: "e", name: "n", role: "finance_approver" })).toContain("kit.test");
    expect(approvalTypesApprovableBy({ id: "u", email: "e", name: "n", role: "viewer" })).not.toContain("kit.test");
  });

  it("listMyRequests returns the caller's requests; decideApprovalAction validates input", async () => {
    const agent = await makeUser("support_agent");
    const req = await prisma.$transaction((tx) => requestApproval(tx, { type: "kit.test", payload: { n: 1 }, requestedBy: agent }));
    vi.mocked(getCurrentUser).mockResolvedValue(agent);
    expect((await listMyRequests()).map((r) => r.id)).toContain(req.id);
    const fd = new FormData();
    fd.set("requestId", req.id);
    fd.set("decision", "maybe");
    expect(await decideApprovalAction(null, fd)).toMatchObject({ ok: false });
  });
});

describe("audit helpers", () => {
  it("computeHash/hashedFieldsOf/verifyRows agree with stored rows; toJson normalizes", async () => {
    const actor = await makeUser("viewer");
    const ev = await prisma.$transaction((tx) => audit.record(tx, { actor, action: "kit.hash", entityType: "K", entityId: "1", after: { d: new Date(0) } }));
    expect(computeHash(ev.prevHash, hashedFieldsOf(ev))).toBe(ev.hash);
    expect(verifyRows([ev], ev.prevHash).result).toMatchObject({ ok: true, checked: 1 });
    expect(verifyRows([ev], GENESIS_HASH).result).toMatchObject({ ok: ev.prevHash === GENESIS_HASH });
    expect(toJson({ d: new Date(0), u: undefined })).toEqual({ d: "1970-01-01T00:00:00.000Z" });
    expect(toJson(undefined)).toBeNull();
  });

  it("parseAuditFilters drops invalid input; list loaders and history; CSV neutralizes formulas", async () => {
    expect(parseAuditFilters({ actor: "a", from: "nope" })).toEqual({});
    expect(parseAuditFilters({ actor: "a", action: ["x"] })).toEqual({ actor: "a" });
    const admin = await makeUser("platform_admin");
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    await prisma.$transaction((tx) => audit.record(tx, { actor: admin, action: "kit.list", entityType: "KitList", entityId: admin.id, after: "=SUM(A1)" }));
    const all = await listAllAuditEvents({ entity: admin.id });
    const recent = await listAuditEvents({ entity: admin.id }, 10);
    expect(all.map((e) => e.action)).toContain("kit.list");
    expect(recent).toHaveLength(all.length);
    expect((await loadEntityHistory("KitList", admin.id))[0].action).toBe("kit.list");
    const csv = auditEventsToCsv(all.filter((e) => e.action === "kit.list"));
    expect(csv.split("\n")[0]).toMatch(/^id,timestamp/);
    expect(csv).toContain(`"'=SUM(A1)"`);
    await expect(verifyIntegrityAction()).resolves.toMatchObject({ ok: true });
  });
});

describe("ui helpers and components", () => {
  it("format, money, mask, icons, nav", () => {
    expect(formatDateTime(new Date("2026-11-10T13:26:59Z"))).toBe("2026-11-10 13:26");
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatMoney(500, "JPY")).toBe("¥500");
    expect(() => formatMoney(1.5, "USD")).toThrow();
    expect(parseToMinorUnits("12.5")).toBe(1250);
    expect(parseToMinorUnits("1.234")).toBeNull();
    expect(maskAccountNumber("GB29 NWBK 6016 1331 9268 19")).toBe("••••6819");
    expect(Object.keys(ICONS)).toContain("flag");
    const nav = navFor({ id: "u", email: "e", name: "n", role: "support_agent" });
    expect(nav.apps.map((a) => a.href)).toContain("/refunds");
    expect(nav.kit.map((k) => k.href)).not.toContain("/admin/audit");
  });

  it("components render", async () => {
    expect(html(<PageHeader title="Refunds" description="d" />)).toContain("Refunds");
    expect(html(<StatusBadge status="pending_approval" />)).toContain("pending approval");
    expect(html(<NavLink href="/refunds" label="Refunds" icon="receipt" />)).toContain("bg-zinc-800");
    expect(html(<DiffView before={{ a: 1 }} after={{ a: 2 }} metadata={{ m: 1 }} />)).toContain("bg-amber-50");
    expect(html(<DataTable columns={[{ key: "k", header: "K" }]} rows={[{ id: "1", cells: { k: "cell" } }]} />)).toContain("cell");
    expect(html(<DecisionForm requestId="r1" />)).toContain("Approve");
    expect(html(<VerifyIntegrityButton />)).toContain("Verify integrity");
    vi.mocked(requireUser).mockResolvedValue({ id: "u", email: "agent@x", name: "Agent", role: "support_agent" });
    expect(html(await AppShell({ children: "body" }))).toContain("Sign out");
  });
});
