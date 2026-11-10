import "@/apps/approval-types";
import { prisma } from "@/kit/db";
import { withPermission } from "@/kit/rbac/with-permission";
import { approvalTypesApprovableBy } from "./registry";

const include = {
  requestedBy: { select: { email: true, name: true } },
  decidedBy: { select: { email: true, name: true } },
} as const;

export const listMyRequests = withPermission("approvals.view", async (user) =>
  prisma.approvalRequest.findMany({ where: { requestedById: user.id }, include, orderBy: { requestedAt: "desc" } }),
);

/** Pending requests this user may decide: they hold the type's permission and did not request it. */
export const listWaitingForMe = withPermission("approvals.view", async (user) =>
  prisma.approvalRequest.findMany({
    where: { status: "pending", type: { in: approvalTypesApprovableBy(user) }, requestedById: { not: user.id } },
    include,
    orderBy: { requestedAt: "asc" },
  }),
);
