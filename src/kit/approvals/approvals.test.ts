import { describe, expect, it, vi } from "vitest";

vi.mock("@/kit/auth/current-user", () => ({ getCurrentUser: vi.fn(), requireUser: vi.fn() }));
import { makeUser } from "../../../tests/helpers";
import { getCurrentUser } from "@/kit/auth/current-user";
import { prisma } from "@/kit/db";
import { ConflictError, ForbiddenError } from "@/kit/errors";
import { registerApprovalType } from "./registry";
import { listWaitingForMe } from "./queries";
import { approve, reject, requestApproval } from "./service";

const execute = vi.fn(async () => ({ done: true }));
registerApprovalType<{ n: number }>("test.thing", { permissionToApprove: "refunds.approve_large", execute });
registerApprovalType<{ n: number }>("test.urgent_thing", { permissionToApprove: "refunds.approve_large", urgent: true, execute });

async function newRequest(requester: Awaited<ReturnType<typeof makeUser>>) {
  return prisma.$transaction((tx) => requestApproval(tx, { type: "test.thing", payload: { n: 1 }, requestedBy: requester }));
}

describe("approvals", () => {
  it("rejects self-approval even when the requester holds the approve permission", async () => {
    const approver = await makeUser("finance_approver");
    const req = await newRequest(approver);

    await expect(approve(req.id, approver)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reject(req.id, approver)).rejects.toBeInstanceOf(ForbiddenError);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("pending");
    const denial = await prisma.auditEvent.findFirst({ where: { action: "access_denied", entityId: req.id } });
    expect(denial?.metadata).toMatchObject({ reason: "self_approval" });
  });

  it("rejects approvers without the permission", async () => {
    const requester = await makeUser("support_agent");
    const otherAgent = await makeUser("support_agent");
    const req = await newRequest(requester);
    await expect(approve(req.id, otherAgent)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a different approver approves, execute() runs, and everything is audited", async () => {
    const requester = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const req = await newRequest(requester);
    execute.mockClear();

    const done = await approve(req.id, approver, "ok");

    expect(done.status).toBe("executed");
    expect(done.decidedById).toBe(approver.id);
    expect(execute).toHaveBeenCalledOnce();
    const actions = (await prisma.auditEvent.findMany({ where: { entityId: req.id }, orderBy: { id: "asc" } })).map((e) => e.action);
    expect(actions).toEqual(["approval.requested", "approval.approved", "approval.executed"]);

    await expect(approve(req.id, approver)).rejects.toBeInstanceOf(ConflictError);
  });

  it("marks the request failed when execute() throws", async () => {
    const requester = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const req = await newRequest(requester);
    execute.mockRejectedValueOnce(new Error("processor down"));

    await expect(approve(req.id, approver)).rejects.toThrow(/processor down/);
    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("failed");
  });

  it("stores urgency from the approval type and lists urgent requests first in Waiting for me", async () => {
    const requester = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const normal = await newRequest(requester);
    const urgent = await prisma.$transaction((tx) => requestApproval(tx, { type: "test.urgent_thing", payload: { n: 2 }, requestedBy: requester }));
    expect(normal.urgent).toBe(false);
    expect(urgent.urgent).toBe(true);
    const requested = await prisma.auditEvent.findFirstOrThrow({ where: { action: "approval.requested", entityId: urgent.id } });
    expect(requested.after).toMatchObject({ urgent: true });

    vi.mocked(getCurrentUser).mockResolvedValue(approver);
    const queue = await listWaitingForMe();
    const ids = queue.map((r) => r.id);
    expect(ids.indexOf(urgent.id)).toBeLessThan(ids.indexOf(normal.id));
    expect(queue.findIndex((r) => !r.urgent)).toBeGreaterThan(queue.findLastIndex((r) => r.urgent));
  });

  it("runs onFailure in the failing transaction", async () => {
    const onFailure = vi.fn(async () => {});
    registerApprovalType<{ n: number }>("test.failing", {
      permissionToApprove: "refunds.approve_large",
      execute: async () => { throw new Error("boom"); },
      onFailure,
    });
    const requester = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const req = await prisma.$transaction((tx) => requestApproval(tx, { type: "test.failing", payload: { n: 3 }, requestedBy: requester }));
    await expect(approve(req.id, approver)).rejects.toThrow(/boom/);
    expect(onFailure).toHaveBeenCalledOnce();
  });
});
