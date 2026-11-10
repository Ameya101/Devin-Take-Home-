import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/kit/auth/current-user", () => ({ getCurrentUser: vi.fn(), requireUser: vi.fn() }));

import "@/apps/approval-types";
import { makeUser } from "../../../tests/helpers";
import { getCurrentUser } from "@/kit/auth/current-user";
import { getApprovalType } from "@/kit/approvals/registry";
import { approve, reject } from "@/kit/approvals/service";
import { listWaitingForMe } from "@/kit/approvals/queries";
import { audit } from "@/kit/audit/audit";
import { prisma } from "@/kit/db";
import { ConflictError, ForbiddenError, ValidationError } from "@/kit/errors";
import { can } from "@/kit/rbac/can";
import { FLAG_KILL_SWITCH_APPROVAL, FLAG_PROD_CHANGE_APPROVAL } from "./config";
import { canApplyProdChange, effectiveRollout, formatState, routeFlagChange } from "./policy";
import { summarizeFlagEvent } from "./history";
import { getFlagDetail, HISTORY_PAGE_SIZE, listFlags } from "./queries";
import { createFlagSchema, directChangeFormSchema } from "./schema";
import { createFlag, requestKillSwitch, requestProdChange, setDirectState } from "./service";

const newKey = () => `test.flag-${randomUUID().slice(0, 8)}`;
const prodOf = async (flagId: string) =>
  prisma.flagEnvironment.findUniqueOrThrow({ where: { flagId_environment: { flagId, environment: "prod" } } });

/** A flag whose prod is on at `rollout`%, applied through a real approval. */
async function flagWithProdOn(rollout: number) {
  const maker = await makeUser("eng_admin");
  const checker = await makeUser("eng_admin");
  const flag = await createFlag(maker, { key: newKey(), description: "A flag used by tests.", ownerTeam: "platform" });
  const { approval } = await requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent: rollout });
  await approve(approval.id, checker);
  return { flag, maker, checker };
}

describe("flag policy", () => {
  it("applies dev/staging directly and routes prod to approval", () => {
    expect(routeFlagChange("dev")).toBe("apply_directly");
    expect(routeFlagChange("staging")).toBe("apply_directly");
    expect(routeFlagChange("prod")).toBe("requires_approval");
  });

  it("formats state and treats a disabled flag as 0% effective", () => {
    expect(formatState({ enabled: true, rolloutPercent: 25 })).toMatch(/on.*25%/i);
    expect(effectiveRollout({ enabled: false, rolloutPercent: 80 })).toBe(0);
    expect(effectiveRollout({ enabled: true, rolloutPercent: 80 })).toBe(80);
  });

  it("only applies a prod change if prod still matches its from-state; kill switches always apply", () => {
    const from = { enabled: true, rolloutPercent: 10 };
    expect(canApplyProdChange("change", from, { enabled: true, rolloutPercent: 10 })).toBe(true);
    expect(canApplyProdChange("change", from, { enabled: false, rolloutPercent: 10 })).toBe(false);
    expect(canApplyProdChange("kill_switch", from, { enabled: true, rolloutPercent: 50 })).toBe(true);
  });

  it("validates keys and rollout bounds", () => {
    expect(createFlagSchema.safeParse({ key: "checkout.new-sheet", description: "Long enough text", ownerTeam: "payments" }).success).toBe(true);
    expect(createFlagSchema.safeParse({ key: "Checkout New", description: "Long enough text", ownerTeam: "payments" }).success).toBe(false);
    const direct = (rolloutPercent: string, environment = "staging") =>
      directChangeFormSchema.safeParse({ flagId: "f", environment, enabled: "on", rolloutPercent });
    expect(direct("0").success).toBe(true);
    expect(direct("100").success).toBe(true);
    for (const bad of ["-1", "101", "12.5", "abc"]) expect(direct(bad).success).toBe(false);
    expect(direct("50", "prod").success).toBe(false);
  });

  it("grants flag permissions to eng_admin only (viewers and platform admins can view)", () => {
    for (const p of ["flags.create", "flags.edit_nonprod", "flags.request_prod", "flags.approve_prod"] as const) {
      expect(can({ role: "eng_admin" }, p)).toBe(true);
      for (const role of ["viewer", "support_agent", "finance_approver", "platform_admin"] as const) expect(can({ role }, p)).toBe(false);
    }
    expect(can({ role: "viewer" }, "flags.view")).toBe(true);
    expect(can({ role: "support_agent" }, "flags.view")).toBe(false);
  });

  it("registers both prod approval types, only the kill switch as urgent", () => {
    expect(getApprovalType(FLAG_PROD_CHANGE_APPROVAL)).toMatchObject({ permissionToApprove: "flags.approve_prod" });
    expect(getApprovalType(FLAG_PROD_CHANGE_APPROVAL).urgent).toBeFalsy();
    expect(getApprovalType(FLAG_KILL_SWITCH_APPROVAL)).toMatchObject({ permissionToApprove: "flags.approve_prod", urgent: true });
  });
});

describe("flag changes", () => {
  it("creates a flag with every environment off and changes staging directly, audited", async () => {
    const eng = await makeUser("eng_admin");
    const flag = await createFlag(eng, { key: newKey(), description: "Directly changed in staging.", ownerTeam: "growth" });
    expect(flag.environments.map((e) => [e.environment, e.enabled, e.rolloutPercent]).sort()).toEqual([
      ["dev", false, 0],
      ["prod", false, 0],
      ["staging", false, 0],
    ]);
    await expect(createFlag(eng, { key: flag.key, description: "Duplicate key here.", ownerTeam: "growth" })).rejects.toBeInstanceOf(ConflictError);

    const staging = await setDirectState(eng, { flagId: flag.id, environment: "staging", enabled: true, rolloutPercent: 40 });
    expect(staging).toMatchObject({ enabled: true, rolloutPercent: 40 });
    await expect(setDirectState(eng, { flagId: flag.id, environment: "prod", enabled: true, rolloutPercent: 40 })).rejects.toBeInstanceOf(ValidationError);

    const events = await prisma.auditEvent.findMany({ where: { entityType: "FeatureFlag", entityId: flag.id }, orderBy: { id: "asc" } });
    expect(events.map((e) => e.action)).toEqual(["flag.created", "flag.env_updated"]);
    expect(events[1].before).toMatchObject({ environment: "staging", enabled: false, rolloutPercent: 0 });
    expect(events[1].after).toMatchObject({ environment: "staging", enabled: true, rolloutPercent: 40 });
    expect(events[1].actorId).toBe(eng.id);
  });

  it("a prod change waits for approval, the requester cannot approve it, a different eng_admin can", async () => {
    const maker = await makeUser("eng_admin");
    const checker = await makeUser("eng_admin");
    const flag = await createFlag(maker, { key: newKey(), description: "Needs prod approval.", ownerTeam: "payments" });

    const { approval, changeRequest } = await requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent: 25, reason: "soaked" });
    expect(approval).toMatchObject({ type: FLAG_PROD_CHANGE_APPROVAL, status: "pending", urgent: false });
    expect(changeRequest).toMatchObject({ kind: "change", toEnabled: true, toRolloutPercent: 25 });
    expect(await prodOf(flag.id)).toMatchObject({ enabled: false, rolloutPercent: 0 });
    await expect(requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent: 50 })).rejects.toBeInstanceOf(ConflictError);

    await expect(approve(approval.id, maker)).rejects.toBeInstanceOf(ForbiddenError);
    const financeApprover = await makeUser("finance_approver");
    await expect(approve(approval.id, financeApprover)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prodOf(flag.id)).toMatchObject({ enabled: false });

    expect((await approve(approval.id, checker)).status).toBe("executed");
    expect(await prodOf(flag.id)).toMatchObject({ enabled: true, rolloutPercent: 25 });
    const applied = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: flag.id, action: "flag.env_updated" }, orderBy: { id: "desc" } });
    expect(applied.actorId).toBe(checker.id);
    expect(applied.metadata).toMatchObject({ environment: "prod", route: "approval", approvalRequestId: approval.id, requestedById: maker.id });
  });

  it("the kill switch is urgent, jumps the queue, and turns prod off once approved by another eng_admin", async () => {
    const { flag, maker, checker } = await flagWithProdOn(30);
    const other = await flagWithProdOn(10);
    const { approval: normal } = await requestProdChange(other.maker, { flagId: other.flag.id, enabled: true, rolloutPercent: 60 });
    const { approval: kill } = await requestKillSwitch(maker, { flagId: flag.id, reason: "Error rate spiking" });
    expect(kill).toMatchObject({ type: FLAG_KILL_SWITCH_APPROVAL, urgent: true, status: "pending" });
    await expect(requestKillSwitch(maker, { flagId: flag.id, reason: "Again please" })).rejects.toBeInstanceOf(ConflictError);

    vi.mocked(getCurrentUser).mockResolvedValue(checker);
    const queue = (await listWaitingForMe()).map((r) => r.id);
    expect(queue.indexOf(kill.id)).toBeGreaterThanOrEqual(0);
    expect(queue.indexOf(kill.id)).toBeLessThan(queue.indexOf(normal.id));

    await expect(approve(kill.id, maker)).rejects.toBeInstanceOf(ForbiddenError);
    await approve(kill.id, checker);
    expect(await prodOf(flag.id)).toMatchObject({ enabled: false, rolloutPercent: 30 });
    await expect(requestKillSwitch(maker, { flagId: flag.id, reason: "Already off" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("a stale prod change fails on approval instead of undoing a kill switch, and the failure is on the flag's history", async () => {
    const { flag, maker, checker } = await flagWithProdOn(20);
    const { approval: bump } = await requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent: 100 });
    const { approval: kill } = await requestKillSwitch(maker, { flagId: flag.id, reason: "Incident" });
    await approve(kill.id, checker);

    await expect(approve(bump.id, checker)).rejects.toThrow(/prod changed since/);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: bump.id } })).status).toBe("failed");
    expect(await prodOf(flag.id)).toMatchObject({ enabled: false, rolloutPercent: 20 });
    const failed = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: flag.id, action: "flag.prod_change_failed" } });
    expect(failed.metadata).toMatchObject({ error: expect.stringMatching(/prod changed since/) });
  });

  it("allows one pending prod change per flag even under concurrent requests, and frees it once decided", async () => {
    const maker = await makeUser("eng_admin");
    const checker = await makeUser("eng_admin");
    const flag = await createFlag(maker, { key: newKey(), description: "Concurrent requests.", ownerTeam: "platform" });
    const results = await Promise.allSettled(
      [10, 20, 30, 40].map((rolloutPercent) => requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ConflictError);

    const pending = await prisma.flagChangeRequest.findFirstOrThrow({ where: { flagId: flag.id } });
    await reject(pending.approvalRequestId, checker, "not now");
    await expect(requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent: 5 })).resolves.toBeTruthy();
  });

  it("rejecting a prod change leaves prod alone and records it on the flag", async () => {
    const maker = await makeUser("eng_admin");
    const checker = await makeUser("eng_admin");
    const flag = await createFlag(maker, { key: newKey(), description: "Will be rejected.", ownerTeam: "risk" });
    const { approval } = await requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent: 5 });
    await reject(approval.id, checker, "not yet");
    expect(await prodOf(flag.id)).toMatchObject({ enabled: false });
    expect(await prisma.auditEvent.count({ where: { entityId: flag.id, action: "flag.prod_change_rejected" } })).toBe(1);
  });

  it("loaders need flags.view; the detail shows the flag's audit history newest first", async () => {
    const { flag } = await flagWithProdOn(15);
    vi.mocked(getCurrentUser).mockResolvedValue(await makeUser("support_agent"));
    await expect(listFlags()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getFlagDetail(flag.id)).rejects.toBeInstanceOf(ForbiddenError);

    vi.mocked(getCurrentUser).mockResolvedValue(await makeUser("viewer"));
    const detail = await getFlagDetail(flag.id);
    expect(detail?.history.map((e) => e.action)).toEqual(["flag.env_updated", "flag.prod_change_requested", "flag.created"]);
    expect(detail?.changeRequests[0].approval?.status).toBe("executed");
    expect((await listFlags()).some((f) => f.id === flag.id)).toBe(true);
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });
});

describe("flag history", () => {
  it("shows the stored rollout when a disabled flag's rollout changes", () => {
    const e = { action: "flag.env_updated", before: { environment: "staging", enabled: false, rolloutPercent: 10 }, after: { environment: "staging", enabled: false, rolloutPercent: 70 }, metadata: { environment: "staging", route: "direct" } };
    expect(summarizeFlagEvent(e).change).toBe("off (10% saved) → off (70% saved)");
  });

  it("audits releasing the pending slot when an approval is decided", async () => {
    const maker = await makeUser("eng_admin");
    const checker = await makeUser("eng_admin");
    const flag = await createFlag(maker, { key: newKey(), description: "Slot release audit.", ownerTeam: "platform" });
    const { approval, changeRequest } = await requestProdChange(maker, { flagId: flag.id, enabled: true, rolloutPercent: 5 });
    await reject(approval.id, checker, "no");
    const closed = await prisma.auditEvent.findFirstOrThrow({ where: { action: "flag.change_request_closed", entityId: changeRequest.id } });
    expect(closed.before).toMatchObject({ pendingSlot: `${flag.id}:change` });
    expect(closed.after).toMatchObject({ pendingSlot: null });
  });

  it("pages through the full history with a cursor", async () => {
    const admin = await makeUser("eng_admin");
    const flag = await createFlag(admin, { key: newKey(), description: "Lots of history.", ownerTeam: "platform" });
    for (let i = 1; i <= HISTORY_PAGE_SIZE + 4; i++) {
      await setDirectState(admin, { flagId: flag.id, environment: "staging", enabled: false, rolloutPercent: i });
    }
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    const first = await getFlagDetail(flag.id);
    expect(first!.history).toHaveLength(HISTORY_PAGE_SIZE);
    expect(first!.olderCursor).not.toBeNull();
    const second = await getFlagDetail(flag.id, first!.olderCursor!);
    expect(second!.history).toHaveLength(5);
    expect(second!.olderCursor).toBeNull();
    expect(second!.history.at(-1)!.action).toBe("flag.created");
  });
});
