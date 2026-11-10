import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/kit/db";
import { withPermission } from "@/kit/rbac/with-permission";

export const auditFilterSchema = z.object({
  actor: z.string().trim().optional(),
  action: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  from: z.string().date().optional().or(z.literal("")),
  to: z.string().date().optional().or(z.literal("")),
}).strict();
export type AuditFilters = z.infer<typeof auditFilterSchema>;

export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const pick = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const parsed = auditFilterSchema.safeParse({
    actor: pick("actor"),
    action: pick("action"),
    entity: pick("entity"),
    from: pick("from"),
    to: pick("to"),
  });
  return parsed.success ? parsed.data : {};
}

function whereFor(f: AuditFilters): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};
  if (f.actor) where.actorEmail = { contains: f.actor };
  if (f.action) where.action = { contains: f.action };
  if (f.entity) where.OR = [{ entityType: { contains: f.entity } }, { entityId: { contains: f.entity } }];
  if (f.from || f.to) {
    where.timestamp = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00.000Z`) } : {}),
      ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}),
    };
  }
  return where;
}

/** Every matching event, oldest first, fetched in id-cursor pages (for complete exports). */
export const listAllAuditEvents = withPermission("audit.view", async (_user, filters: AuditFilters) => {
  const pageSize = 5_000;
  const rows = [];
  let cursor = 0;
  for (;;) {
    const page = await prisma.auditEvent.findMany({ where: { AND: [whereFor(filters), { id: { gt: cursor } }] }, orderBy: { id: "asc" }, take: pageSize });
    rows.push(...page);
    if (page.length < pageSize) return rows;
    cursor = page[page.length - 1].id;
  }
});

export const listAuditEvents = withPermission("audit.view", async (_user, filters: AuditFilters, limit: number = 500) =>
  prisma.auditEvent.findMany({ where: whereFor(filters), orderBy: { id: "desc" }, take: limit }),
);

/**
 * One page of audit events for one entity, newest first; pass the last id seen as `before` for the next page.
 * NOT permission-checked: call it from an app loader wrapped in withPermission with the app's own view permission.
 */
export async function loadEntityHistory(entityType: string, entityId: string, opts: { limit?: number; before?: number } = {}) {
  const { limit = 50, before } = opts;
  return prisma.auditEvent.findMany({
    where: { entityType, entityId, ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: "desc" },
    take: limit,
  });
}
