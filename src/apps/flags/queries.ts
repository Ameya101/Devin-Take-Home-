import { loadEntityHistory } from "@/kit/audit/queries";
import { prisma } from "@/kit/db";
import { withPermission } from "@/kit/rbac/with-permission";
import { FLAG_ENTITY, OWNER_TEAMS } from "./config";
import { pendingProdRequests } from "./service";

export const listFlags = withPermission("flags.view", async () => {
  const flags = await prisma.featureFlag.findMany({ include: { environments: true }, orderBy: { key: "asc" } });
  const pending = await pendingProdRequests(prisma, flags.map((f) => f.id));
  return flags.map((f) => ({ ...f, pending: pending.filter((p) => p.flagId === f.id) }));
});

export const getFlagDetail = withPermission("flags.view", async (_user, flagId: string) => {
  const flag = await prisma.featureFlag.findUnique({ where: { id: flagId }, include: { environments: true } });
  if (!flag) return null;
  const changeRequests = await prisma.flagChangeRequest.findMany({ where: { flagId }, orderBy: { createdAt: "desc" }, take: 20 });
  const approvals = await prisma.approvalRequest.findMany({
    where: { id: { in: changeRequests.map((c) => c.approvalRequestId) } },
    include: { requestedBy: { select: { email: true } }, decidedBy: { select: { email: true } } },
  });
  const approvalById = new Map(approvals.map((a) => [a.id, a]));
  const history = await loadEntityHistory(FLAG_ENTITY, flagId);
  return {
    flag,
    changeRequests: changeRequests.map((c) => ({ ...c, approval: approvalById.get(c.approvalRequestId) ?? null })),
    history,
  };
});

/** Options for the "New flag" form; also gates the page on flags.create. */
export const getCreateFlagOptions = withPermission("flags.create", async () => ({ ownerTeams: OWNER_TEAMS }));
