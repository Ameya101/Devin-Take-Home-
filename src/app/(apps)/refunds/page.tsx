import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAYMENT_STATUSES } from "@/apps/refunds/config";
import { listPayments } from "@/apps/refunds/queries";
import { orForbidden } from "@/kit/rbac/page";
import { DataTable, type DataTableColumn } from "@/kit/ui/data-table";
import { formatDateTime } from "@/kit/ui/format";
import { maskCard, maskEmail } from "@/kit/ui/mask";
import { formatMoney } from "@/kit/ui/money";
import { PageHeader } from "@/kit/ui/page-header";
import { StatusBadge } from "@/kit/ui/status-badge";

const columns: DataTableColumn[] = [
  { key: "createdAt", header: "Date", sortable: true },
  { key: "customer", header: "Customer", sortable: true },
  { key: "email", header: "Email" },
  { key: "card", header: "Card" },
  { key: "amount", header: "Amount", sortable: true, className: "text-right" },
  { key: "refunded", header: "Refunded", sortable: true, className: "text-right" },
  { key: "status", header: "Status", sortable: true },
];

export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const payments = await orForbidden(listPayments({ q: q || undefined, status: status || undefined }));

  const rows = payments.map((p) => {
    const refunded = p.refunds.filter((r) => r.status === "processed").reduce((s, r) => s + r.amountCents, 0);
    return {
      id: p.id,
      href: `/refunds/${p.id}`,
      searchText: `${p.customer.name} ${p.id} ${p.status}`,
      sortValues: { createdAt: p.createdAt.getTime(), customer: p.customer.name, amount: p.amountCents, refunded, status: p.status },
      cells: {
        createdAt: formatDateTime(p.createdAt),
        customer: <span className="font-medium">{p.customer.name}</span>,
        email: maskEmail(p.customer.email),
        card: <span className="font-mono">{maskCard(p.cardLast4)}</span>,
        amount: formatMoney(p.amountCents, p.currency),
        refunded: refunded ? formatMoney(refunded, p.currency) : "—",
        status: <StatusBadge status={p.status} />,
      },
    };
  });

  return (
    <div>
      <PageHeader title="Refunds" description="Find a payment and issue a refund. Customer PII is masked in this list." />
      <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
        <Input name="q" defaultValue={q} placeholder="Search customer name or email" className="w-72" />
        <select name="status" defaultValue={status ?? ""} className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm">
          <option value="">All statuses</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <DataTable columns={columns} rows={rows} filterPlaceholder="Quick filter this page…" emptyMessage="No payments match." />
    </div>
  );
}
