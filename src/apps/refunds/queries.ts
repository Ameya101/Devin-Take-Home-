import type { Prisma } from "@prisma/client";
import { prisma } from "@/kit/db";
import { withPermission } from "@/kit/rbac/with-permission";

export type PaymentFilters = { q?: string; status?: string };

export const listPayments = withPermission("refunds.view", async (_user, filters: PaymentFilters) => {
  const where: Prisma.PaymentWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.q) where.customer = { OR: [{ name: { contains: filters.q } }, { email: { contains: filters.q } }] };
  return prisma.payment.findMany({ where, include: { customer: true, refunds: true }, orderBy: { createdAt: "desc" } });
});

export const getPaymentDetail = withPermission("refunds.view", async (_user, paymentId: string) => {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: true,
      refunds: { include: { requestedBy: { select: { email: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!payment) return null;
  const approvalIds = payment.refunds.flatMap((r) => (r.approvalRequestId ? [r.approvalRequestId] : []));
  const failed = await prisma.approvalRequest.findMany({ where: { id: { in: approvalIds }, status: "failed" }, select: { id: true } });
  const failedIds = new Set(failed.map((a) => a.id));
  // Still reserved, but its approval failed without a confirmed decline: needs reconciling with the processor.
  const refunds = payment.refunds.map((r) => ({
    ...r,
    outcomeUnknown: r.status === "pending_approval" && r.approvalRequestId !== null && failedIds.has(r.approvalRequestId),
  }));
  return { ...payment, refunds };
});
