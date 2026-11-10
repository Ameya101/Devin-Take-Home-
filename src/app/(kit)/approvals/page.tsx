import Link from "next/link";
import { DecisionForm } from "@/kit/approvals/decision-form";
import { listMyRequests, listWaitingForMe } from "@/kit/approvals/queries";
import { describeApproval } from "@/kit/approvals/registry";
import { orForbidden } from "@/kit/rbac/page";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/kit/ui/data-table";
import { formatDateTime } from "@/kit/ui/format";
import { PageHeader } from "@/kit/ui/page-header";
import { StatusBadge } from "@/kit/ui/status-badge";
import { cn } from "@/lib/utils";

const columns: DataTableColumn[] = [
  { key: "type", header: "Type", sortable: true },
  { key: "summary", header: "Summary" },
  { key: "requestedBy", header: "Requested by", sortable: true },
  { key: "requestedAt", header: "Requested", sortable: true },
  { key: "status", header: "Status", sortable: true },
  { key: "decision", header: "Decision" },
];

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "mine" ? "mine" : "waiting";
  const requests = await orForbidden(tab === "mine" ? listMyRequests() : listWaitingForMe());

  const rows: DataTableRow[] = requests.map((r) => ({
    id: r.id,
    searchText: `${r.type} ${r.requestedBy.email} ${r.status}`,
    sortValues: { type: r.type, requestedBy: r.requestedBy.email, requestedAt: r.requestedAt.getTime(), status: r.status },
    cells: {
      type: <span className="font-mono text-xs">{r.type}</span>,
      summary: describeApproval(r.type, r.payload),
      requestedBy: r.requestedBy.email,
      requestedAt: formatDateTime(r.requestedAt),
      status: <StatusBadge status={r.status} />,
      decision:
        tab === "waiting" ? (
          <DecisionForm requestId={r.id} />
        ) : r.decidedBy ? (
          <span className="text-xs">
            {r.decidedBy.email}
            {r.decisionNote && <span className="block text-muted-foreground">“{r.decisionNote}”</span>}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Awaiting a different approver</span>
        ),
    },
  }));

  const tabs = [
    { id: "waiting", label: "Waiting for me" },
    { id: "mine", label: "My requests" },
  ];

  return (
    <div>
      <PageHeader title="Approvals" description="Maker-checker: requesters can never approve their own requests. Enforced on the server." />
      <div className="mb-4 inline-flex rounded-lg border bg-background p-1">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/approvals?tab=${t.id}`}
            className={cn("rounded-md px-3 py-1.5 text-sm", tab === t.id ? "bg-zinc-900 text-white" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <DataTable columns={columns} rows={rows} emptyMessage={tab === "waiting" ? "Nothing is waiting for you." : "You have not requested anything."} />
    </div>
  );
}
