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
});
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

export const listAuditEvents = withPermission("audit.view", async (_user, filters: AuditFilters, limit: number = 500) =>
  prisma.auditEvent.findMany({ where: whereFor(filters), orderBy: { id: "desc" }, take: limit }),
);
