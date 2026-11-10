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

export const getPaymentDetail = withPermission("refunds.view", async (_user, paymentId: string) =>
  prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: true,
      refunds: { include: { requestedBy: { select: { email: true } } }, orderBy: { createdAt: "desc" } },
    },
  }),
);
