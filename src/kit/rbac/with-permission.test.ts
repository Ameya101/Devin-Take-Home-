import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/kit/auth/current-user", () => ({ getCurrentUser: vi.fn(), requireUser: vi.fn() }));

import { makeUser } from "../../../tests/helpers";
import { getCurrentUser } from "@/kit/auth/current-user";
import { prisma } from "@/kit/db";
import { ForbiddenError } from "@/kit/errors";
import { can } from "./can";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from "./permissions";
import { withPermission } from "./with-permission";

describe("can()", () => {
  it("maps roles to permissions", () => {
    expect(can({ role: "support_agent" }, "refunds.create")).toBe(true);
    expect(can({ role: "support_agent" }, "refunds.approve_large")).toBe(false);
    expect(can({ role: "finance_approver" }, "refunds.approve_large")).toBe(true);
    expect(can({ role: "viewer" }, "refunds.create")).toBe(false);
    expect(can({ role: "platform_admin" }, "audit.view")).toBe(true);
    expect(can(null, "refunds.view")).toBe(false);
  });

  it("only grants permissions that are declared by the kit or an app manifest", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) expect(ALL_PERMISSIONS).toContain(p);
    }
  });
});

describe("withPermission()", () => {
  beforeEach(() => vi.mocked(getCurrentUser).mockReset());

  it("throws 403, skips the handler and audits access_denied when the permission is missing", async () => {
    const viewer = await makeUser("viewer");
    vi.mocked(getCurrentUser).mockResolvedValue(viewer);
    const handler = vi.fn(async () => "ran");

    const action = withPermission("refunds.create", handler);
    const err = await action().catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    const event = await prisma.auditEvent.findFirst({ where: { actorId: viewer.id, action: "access_denied" } });
    expect(event?.metadata).toMatchObject({ permission: "refunds.create", role: "viewer" });
  });

  it("denies and audits when nobody is signed in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(withPermission("refunds.view", async () => "ran")()).rejects.toBeInstanceOf(ForbiddenError);
    const event = await prisma.auditEvent.findFirst({ where: { action: "access_denied", actorId: null }, orderBy: { id: "desc" } });
    expect(event?.metadata).toMatchObject({ reason: "unauthenticated" });
  });

  it("passes the user and arguments through when allowed", async () => {
    const agent = await makeUser("support_agent");
    vi.mocked(getCurrentUser).mockResolvedValue(agent);
    const action = withPermission("refunds.create", async (user, n: number) => `${user.email}:${n}`);
    await expect(action(7)).resolves.toBe(`${agent.email}:7`);
  });
});
