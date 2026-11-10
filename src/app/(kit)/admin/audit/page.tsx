import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DiffView } from "@/kit/audit/diff-view";
import { listAuditEvents, parseAuditFilters } from "@/kit/audit/queries";
import { VerifyIntegrityButton } from "@/kit/audit/verify-button";
import { orForbidden } from "@/kit/rbac/page";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/kit/ui/data-table";
import { formatDateTime } from "@/kit/ui/format";
import { PageHeader } from "@/kit/ui/page-header";

const columns: DataTableColumn[] = [
  { key: "id", header: "#", sortable: true },
  { key: "timestamp", header: "Time (UTC)", sortable: true },
  { key: "actor", header: "Actor", sortable: true },
  { key: "action", header: "Action", sortable: true },
  { key: "entity", header: "Entity" },
  { key: "hash", header: "Hash" },
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseAuditFilters(await searchParams);
  const events = await orForbidden(listAuditEvents(filters));
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  const rows: DataTableRow[] = events.map((e) => ({
    id: String(e.id),
    searchText: `${e.actorEmail ?? "system"} ${e.action} ${e.entityType} ${e.entityId}`,
    sortValues: { id: e.id, timestamp: e.timestamp.getTime(), actor: e.actorEmail ?? "", action: e.action },
    cells: {
      id: e.id,
      timestamp: formatDateTime(e.timestamp),
      actor: e.actorEmail ?? <span className="text-muted-foreground">system</span>,
      action: <span className={e.action === "access_denied" ? "font-mono text-xs text-destructive" : "font-mono text-xs"}>{e.action}</span>,
      entity: (
        <span className="text-xs">
          {e.entityType} <span className="font-mono text-muted-foreground">{e.entityId.slice(-10)}</span>
        </span>
      ),
      hash: (
        <span className="font-mono text-xs text-muted-foreground" title={`prev ${e.prevHash}\nhash ${e.hash}`}>
          {e.prevHash.slice(0, 6)}→{e.hash.slice(0, 6)}
        </span>
      ),
    },
    detail: <DiffView before={e.before} after={e.after} metadata={e.metadata} />,
  }));

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Append-only, SHA-256 hash-chained record of every write and every denied access. Click a row for the before/after diff."
        actions={<VerifyIntegrityButton />}
      />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        {[
          ["actor", "Actor email"],
          ["action", "Action"],
          ["entity", "Entity type / id"],
        ].map(([name, label]) => (
          <div key={name} className="space-y-1">
            <Label htmlFor={name}>{label}</Label>
            <Input id={name} name={name} defaultValue={filters[name as "actor"] ?? ""} className="w-44" />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <Button type="submit" variant="outline">Apply</Button>
        <a href={`/admin/audit/export${exportQuery ? `?${exportQuery}` : ""}`} className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
          Export CSV
        </a>
      </form>
      <DataTable columns={columns} rows={rows} pageSize={20} emptyMessage="No audit events match." />
    </div>
  );
}
