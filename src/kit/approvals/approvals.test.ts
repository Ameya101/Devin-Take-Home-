import { describe, expect, it, vi } from "vitest";
import { makeUser } from "../../../tests/helpers";
import { prisma } from "@/kit/db";
import { ConflictError, ForbiddenError } from "@/kit/errors";
import { registerApprovalType } from "./registry";
import { approve, reject, requestApproval } from "./service";

const execute = vi.fn(async () => ({ done: true }));
registerApprovalType<{ n: number }>("test.thing", { permissionToApprove: "refunds.approve_large", execute });

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
});
