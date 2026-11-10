import type { ApprovalRequest, Prisma } from "@prisma/client";
import { audit } from "@/kit/audit/audit";
import type { SessionUser } from "@/kit/auth/types";
import { prisma, type Tx } from "@/kit/db";
import { ConflictError, KitError, NotFoundError } from "@/kit/errors";
import { assertCan, denyAccess } from "@/kit/rbac/assert";
import { getApprovalType } from "./registry";

function snapshot(r: ApprovalRequest) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    payload: r.payload,
    requestedById: r.requestedById,
    decidedById: r.decidedById,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
  };
}

/** Creates a pending approval request inside the caller's transaction and audits it. */
export async function requestApproval<P extends Prisma.InputJsonValue>(
  tx: Tx,
  input: { type: string; payload: P; requestedBy: SessionUser },
): Promise<ApprovalRequest> {
  getApprovalType(input.type);
  const request = await tx.approvalRequest.create({
    data: { type: input.type, payload: input.payload, requestedById: input.requestedBy.id },
  });
  await audit.record(tx, {
    actor: input.requestedBy,
    action: "approval.requested",
    entityType: "ApprovalRequest",
    entityId: request.id,
    before: null,
    after: snapshot(request),
  });
  return request;
}

/** Server-side checks shared by approve and reject. */
async function loadDecidable(requestId: string, approver: SessionUser) {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Approval request not found");
  const definition = getApprovalType(request.type);
  const context = { entityType: "ApprovalRequest", entityId: requestId };
  await assertCan(approver, definition.permissionToApprove, context);
  if (request.requestedById === approver.id) {
    await denyAccess(approver, definition.permissionToApprove, { ...context, reason: "self_approval" });
  }
  if (request.status !== "pending") throw new ConflictError(`Request is already ${request.status}`);
  return { request, definition };
}

/** Atomically moves a request out of "pending"; fails if someone else decided first. */
async function decide(tx: Tx, request: ApprovalRequest, approver: SessionUser, status: string, note?: string) {
  const { count } = await tx.approvalRequest.updateMany({
    where: { id: request.id, status: "pending" },
    data: { status, decidedById: approver.id, decidedAt: new Date(), decisionNote: note || null },
  });
  if (count !== 1) throw new ConflictError("Request is no longer pending");
  return tx.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
}

/**
 * Approves a request and runs the type's execute() in the same transaction.
 * Audits the decision and the execution. If execute() throws, everything rolls back
 * and the request is marked "failed" (also audited).
 */
export async function approve(requestId: string, approver: SessionUser, note?: string): Promise<ApprovalRequest> {
  const { request, definition } = await loadDecidable(requestId, approver);
  let executing = false;
  try {
    return await prisma.$transaction(async (tx) => {
      const approved = await decide(tx, request, approver, "approved", note);
      await audit.record(tx, {
        actor: approver,
        action: "approval.approved",
        entityType: "ApprovalRequest",
        entityId: request.id,
        before: snapshot(request),
        after: snapshot(approved),
      });
      executing = true;
      const result = await definition.execute(request.payload, tx, { request: approved, approver });
      const executed = await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "executed" } });
      await audit.record(tx, {
        actor: approver,
        action: "approval.executed",
        entityType: "ApprovalRequest",
        entityId: request.id,
        before: snapshot(approved),
        after: snapshot(executed),
        metadata: { result: result ?? null },
      });
      return executed;
    });
  } catch (err) {
    if (!executing) throw err;
    const message = err instanceof Error ? err.message : String(err);
    await prisma.$transaction(async (tx) => {
      const failed = await decide(tx, request, approver, "failed", note);
      await audit.record(tx, {
        actor: approver,
        action: "approval.execution_failed",
        entityType: "ApprovalRequest",
        entityId: request.id,
        before: snapshot(request),
        after: snapshot(failed),
        metadata: { error: message },
      });
      await definition.onFailure?.(request.payload, tx, { request: failed, approver, error: err });
    });
    throw new KitError(`Approved, but execution failed: ${message}`, 500, "execution_failed");
  }
}

export async function reject(requestId: string, approver: SessionUser, note?: string): Promise<ApprovalRequest> {
  const { request, definition } = await loadDecidable(requestId, approver);
  return prisma.$transaction(async (tx) => {
    const rejected = await decide(tx, request, approver, "rejected", note);
    await audit.record(tx, {
      actor: approver,
      action: "approval.rejected",
      entityType: "ApprovalRequest",
      entityId: request.id,
      before: snapshot(request),
      after: snapshot(rejected),
    });
    await definition.onReject?.(request.payload, tx, { request: rejected, approver });
    return rejected;
  });
}
