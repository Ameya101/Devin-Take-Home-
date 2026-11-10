import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EnvBadge } from "@/apps/flags/components/env-badge";
import { EnvStateForm } from "@/apps/flags/components/env-state-form";
import { KillSwitchForm } from "@/apps/flags/components/kill-switch-form";
import { ENVIRONMENTS } from "@/apps/flags/config";
import { summarizeFlagEvent } from "@/apps/flags/history";
import { formatState, routeFlagChange } from "@/apps/flags/policy";
import { getFlagDetail } from "@/apps/flags/queries";
import { DiffView } from "@/kit/audit/diff-view";
import { Can } from "@/kit/rbac/Can";
import { orForbidden } from "@/kit/rbac/page";
import { DataTable, type DataTableColumn, type DataTableRow } from "@/kit/ui/data-table";
import { formatDateTime } from "@/kit/ui/format";
import { PageHeader } from "@/kit/ui/page-header";
import { StatusBadge } from "@/kit/ui/status-badge";

const historyColumns: DataTableColumn[] = [
  { key: "timestamp", header: "Time (UTC)", sortable: true },
  { key: "actor", header: "Actor", sortable: true },
  { key: "action", header: "Event", sortable: true },
  { key: "environment", header: "Env", sortable: true },
  { key: "change", header: "Change" },
];

export default async function FlagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ flagId: string }>;
  searchParams: Promise<{ historyBefore?: string }>;
}) {
  const { flagId } = await params;
  const cursor = Number((await searchParams).historyBefore);
  const historyBefore = Number.isInteger(cursor) && cursor > 0 ? cursor : undefined;
  const detail = await orForbidden(getFlagDetail(flagId, historyBefore));
  if (!detail) notFound();
  const { flag, changeRequests, history, olderCursor } = detail;
  const envs = ENVIRONMENTS.map((name) => flag.environments.find((e) => e.environment === name)).filter((e) => e !== undefined);
  const pendingKill = changeRequests.some((c) => c.kind === "kill_switch" && c.approval?.status === "pending");

  const historyRows: DataTableRow[] = history.map((e) => {
    const s = summarizeFlagEvent(e);
    return {
      id: String(e.id),
      searchText: `${e.actorEmail ?? "system"} ${e.action} ${s.environment} ${s.change}`,
      sortValues: { timestamp: e.id, actor: e.actorEmail ?? "", action: s.label, environment: s.environment },
      cells: {
        timestamp: formatDateTime(e.timestamp),
        actor: e.actorEmail ?? <span className="text-muted-foreground">system</span>,
        action: (
          <span className={e.action.includes("kill_switch") ? "font-medium text-destructive" : "font-medium"}>
            {s.label} <span className="block font-mono text-[10px] font-normal text-muted-foreground">{e.action} #{e.id}</span>
          </span>
        ),
        environment: s.environment,
        change: <span className="whitespace-normal text-xs">{s.change}</span>,
      },
      detail: <DiffView before={e.before} after={e.after} metadata={e.metadata} />,
    };
  });

  return (
    <div>
      <Link href="/flags" className="text-sm text-muted-foreground hover:underline">← All flags</Link>
      <PageHeader
        title={flag.key}
        description={
          <>
            {flag.description} · owner <span className="font-medium text-foreground">{flag.ownerTeam}</span> · created {formatDateTime(flag.createdAt)}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {envs.map((env) => {
          const direct = routeFlagChange(env.environment as (typeof ENVIRONMENTS)[number]) === "apply_directly";
          return (
            <Card key={env.id} className={env.environment === "prod" ? "ring-2 ring-amber-300" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="uppercase tracking-wide">{env.environment}</span>
                  <EnvBadge state={env} />
                </CardTitle>
                <CardDescription>
                  {direct ? "Changes apply immediately." : "Changes need approval from a different eng_admin."} Updated {formatDateTime(env.updatedAt)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Can
                  permission={direct ? "flags.edit_nonprod" : "flags.request_prod"}
                  fallback={<p className="text-sm text-muted-foreground">Read only for your role.</p>}
                >
                  <EnvStateForm
                    flagId={flag.id}
                    environment={env.environment}
                    enabled={env.enabled}
                    rolloutPercent={env.rolloutPercent}
                    mode={direct ? "direct" : "request"}
                  />
                  {!direct && env.enabled && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-xs text-muted-foreground">
                        Emergency: sets enabled=false in prod. Still needs a second eng_admin, but goes to the top of the approvals queue as urgent.
                      </p>
                      {pendingKill ? (
                        <p className="text-sm font-medium text-destructive">Kill switch waiting for approval.</p>
                      ) : (
                        <KillSwitchForm flagId={flag.id} />
                      )}
                    </div>
                  )}
                </Can>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Prod requests</CardTitle>
          <CardDescription>
            Decided on <Link href="/approvals" className="underline">Approvals</Link>. The requester can never approve their own request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested (UTC)</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decided by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changeRequests.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No prod requests yet.</TableCell></TableRow>
              )}
              {changeRequests.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{formatDateTime(c.createdAt)}</TableCell>
                  <TableCell>
                    {c.kind === "kill_switch" ? <StatusBadge status="urgent" className="font-bold uppercase" /> : null}{" "}
                    {c.kind === "kill_switch" ? "kill switch" : "change"}
                  </TableCell>
                  <TableCell>
                    {formatState({ enabled: c.fromEnabled, rolloutPercent: c.fromRolloutPercent })} → {formatState({ enabled: c.toEnabled, rolloutPercent: c.toRolloutPercent })}
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{c.reason ?? "—"}</TableCell>
                  <TableCell>{c.approval?.requestedBy.email ?? "—"}</TableCell>
                  <TableCell>{c.approval ? <StatusBadge status={c.approval.status} /> : "—"}</TableCell>
                  <TableCell>{c.approval?.decidedBy?.email ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Change history</CardTitle>
          <CardDescription>From the hash-chained audit log (entity FeatureFlag {flag.id}). Click a row for the before/after diff.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={historyColumns} rows={historyRows} pageSize={10} filterPlaceholder="Filter history…" emptyMessage="No history." />
          <div className="mt-3 flex gap-4 text-sm">
            {historyBefore && <Link href={`/flags/${flag.id}`} className="underline">← Newest events</Link>}
            {olderCursor && <Link href={`/flags/${flag.id}?historyBefore=${olderCursor}`} className="underline">Older events →</Link>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
