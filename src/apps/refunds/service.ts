import type { Refund } from "@prisma/client";
import { requestApproval } from "@/kit/approvals/service";
import { audit } from "@/kit/audit/audit";
import type { SessionUser } from "@/kit/auth/types";
import { prisma, type Tx } from "@/kit/db";
import { ConflictError, NotFoundError, ValidationError } from "@/kit/errors";
import { REFUND_LARGE_APPROVAL } from "./config";
import { getPaymentsAdapter } from "./payments-adapter";
import { paymentStatusAfterRefunds, remainingRefundableCents, routeRefund, type RefundRoute } from "./policy";
import { refundAmountSchema } from "./schema";

export type IssueRefundInput = { paymentId: string; amountCents: number; reason: string; note?: string };

export type RefundLargePayload = { refundId: string; paymentId: string; amountCents: number; currency: string; reason: string };

/** Issues a refund: small ones are processed now, large ones become a "refund.large" approval request. */
export async function issueRefund(user: SessionUser, input: IssueRefundInput): Promise<{ refund: Refund; route: RefundRoute }> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { refunds: true } });
    if (!payment) throw new NotFoundError("Payment not found");
    if (payment.status === "failed") throw new ValidationError("Failed payments cannot be refunded");

    const amountCents = refundAmountSchema(remainingRefundableCents(payment.amountCents, payment.refunds)).parse(input.amountCents);
    const route = routeRefund(amountCents);

    const created = await tx.refund.create({
      data: {
        paymentId: payment.id,
        amountCents,
        reason: input.reason,
        note: input.note || null,
        status: route === "process_immediately" ? "requested" : "pending_approval",
        requestedById: user.id,
      },
    });

    if (route === "process_immediately") {
      await audit.record(tx, { actor: user, action: "refund.requested", entityType: "Refund", entityId: created.id, before: null, after: created, metadata: { route } });
      return { refund: await processRefund(tx, created.id, user), route };
    }

    const payload: RefundLargePayload = { refundId: created.id, paymentId: payment.id, amountCents, currency: payment.currency, reason: input.reason };
    const approval = await requestApproval(tx, { type: REFUND_LARGE_APPROVAL, payload, requestedBy: user });
    const refund = await tx.refund.update({ where: { id: created.id }, data: { approvalRequestId: approval.id } });
    await audit.record(tx, { actor: user, action: "refund.requested", entityType: "Refund", entityId: refund.id, before: null, after: refund, metadata: { route, approvalRequestId: approval.id } });
    return { refund, route };
  });
}

/** Calls the payments adapter and marks the refund processed. Runs inside the caller's transaction. */
export async function processRefund(tx: Tx, refundId: string, actor: SessionUser): Promise<Refund> {
  const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
  if (!refund) throw new NotFoundError("Refund not found");
  if (refund.status !== "requested" && refund.status !== "pending_approval") {
    throw new ConflictError(`Refund is already ${refund.status}`);
  }
  const { payment, ...before } = refund;

  const { providerRefundId } = await getPaymentsAdapter().refund({
    paymentId: payment.id,
    amountCents: refund.amountCents,
    currency: payment.currency,
    idempotencyKey: refund.id,
  });
  const processed = await tx.refund.update({ where: { id: refund.id }, data: { status: "processed", providerRefundId } });
  await audit.record(tx, { actor, action: "refund.processed", entityType: "Refund", entityId: refund.id, before, after: processed });

  const refunds = await tx.refund.findMany({ where: { paymentId: payment.id } });
  const status = paymentStatusAfterRefunds(payment.amountCents, refunds);
  if (status !== payment.status) {
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { status } });
    await audit.record(tx, { actor, action: "payment.status_changed", entityType: "Payment", entityId: payment.id, before: payment, after: updated });
  }
  return processed;
}

export async function markRefundRejected(tx: Tx, refundId: string, actor: SessionUser): Promise<void> {
  const before = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
  const after = await tx.refund.update({ where: { id: refundId }, data: { status: "rejected" } });
  await audit.record(tx, { actor, action: "refund.rejected", entityType: "Refund", entityId: refundId, before, after });
}
