import { auditEventsToCsv } from "@/kit/audit/csv";
import { listAllAuditEvents, parseAuditFilters } from "@/kit/audit/queries";
import { toRouteHandler } from "@/kit/rbac/http";

export const GET = toRouteHandler(async (req: Request) => {
  const filters = parseAuditFilters(Object.fromEntries(new URL(req.url).searchParams));
  const events = await listAllAuditEvents(filters);
  return new Response(auditEventsToCsv(events), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
