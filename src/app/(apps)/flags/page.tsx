import Link from "next/link";
import { EnvBadge } from "@/apps/flags/components/env-badge";
import { ENVIRONMENTS } from "@/apps/flags/config";
import { effectiveRollout } from "@/apps/flags/policy";
import { listFlags } from "@/apps/flags/queries";
import { Can } from "@/kit/rbac/Can";
import { orForbidden } from "@/kit/rbac/page";
import { DataTable, type DataTableColumn } from "@/kit/ui/data-table";
import { formatDateTime } from "@/kit/ui/format";
import { PageHeader } from "@/kit/ui/page-header";
import { StatusBadge } from "@/kit/ui/status-badge";

const columns: DataTableColumn[] = [
  { key: "key", header: "Key", sortable: true },
  { key: "ownerTeam", header: "Owner team", sortable: true },
  { key: "dev", header: "Dev", sortable: true },
  { key: "staging", header: "Staging", sortable: true },
  { key: "prod", header: "Prod", sortable: true },
  { key: "pending", header: "Prod requests" },
  { key: "updatedAt", header: "Last change (UTC)", sortable: true },
];

export default async function FlagsPage() {
  const flags = await orForbidden(listFlags());

  const rows = flags.map((f) => {
    const env = Object.fromEntries(f.environments.map((e) => [e.environment, e]));
    const updatedAt = new Date(Math.max(f.updatedAt.getTime(), ...f.environments.map((e) => e.updatedAt.getTime())));
    const kill = f.pending.some((p) => p.kind === "kill_switch");
    const change = f.pending.some((p) => p.kind === "change");
    return {
      id: f.id,
      href: `/flags/${f.id}`,
      searchText: `${f.key} ${f.ownerTeam} ${f.description}`,
      sortValues: {
        key: f.key,
        ownerTeam: f.ownerTeam,
        ...Object.fromEntries(ENVIRONMENTS.map((e) => [e, env[e] ? effectiveRollout(env[e]) + (env[e].enabled ? 1 : 0) : -1])),
        updatedAt: updatedAt.getTime(),
      },
      cells: {
        key: (
          <span>
            <span className="font-mono text-sm font-medium">{f.key}</span>
            <span className="block max-w-sm truncate text-xs text-muted-foreground">{f.description}</span>
          </span>
        ),
        ownerTeam: f.ownerTeam,
        ...Object.fromEntries(ENVIRONMENTS.map((e) => [e, env[e] ? <EnvBadge state={env[e]} /> : "—"])),
        pending: (
          <span className="flex flex-col items-start gap-1">
            {kill && <StatusBadge status="urgent" className="font-bold uppercase" />}
            {kill && <span className="text-xs text-destructive">kill switch pending</span>}
            {change && <StatusBadge status="pending" />}
            {!kill && !change && <span className="text-muted-foreground">—</span>}
          </span>
        ),
        updatedAt: formatDateTime(updatedAt),
      },
    };
  });

  return (
    <div>
      <PageHeader
        title="Feature flags"
        description="Per-environment state for every flag. Dev and staging change immediately; prod changes and kill switches need a different eng_admin to approve."
        actions={
          <Can permission="flags.create">
            <Link href="/flags/new" className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80">
              New flag
            </Link>
          </Can>
        }
      />
      <DataTable columns={columns} rows={rows} pageSize={20} filterPlaceholder="Filter by key, team or description…" emptyMessage="No flags yet." />
    </div>
  );
}
