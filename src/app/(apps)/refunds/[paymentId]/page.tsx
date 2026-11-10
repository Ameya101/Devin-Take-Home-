import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IssueRefundForm } from "@/apps/refunds/components/issue-refund-form";
import { ReconcileRefundButton } from "@/apps/refunds/components/reconcile-refund-button";
import { LARGE_REFUND_THRESHOLD_CENTS } from "@/apps/refunds/config";
import { remainingRefundableCents } from "@/apps/refunds/policy";
import { getPaymentDetail } from "@/apps/refunds/queries";
import { getCurrentUser } from "@/kit/auth/current-user";
import { Can } from "@/kit/rbac/Can";
import { can } from "@/kit/rbac/can";
import { orForbidden } from "@/kit/rbac/page";
import { formatDateTime } from "@/kit/ui/format";
import { maskCard, maskEmail, maskName } from "@/kit/ui/mask";
import { formatMoney } from "@/kit/ui/money";
import { PageHeader } from "@/kit/ui/page-header";
import { StatusBadge } from "@/kit/ui/status-badge";

export default async function PaymentDetailPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const payment = await orForbidden(getPaymentDetail(paymentId));
  if (!payment) notFound();
  const user = await getCurrentUser();
  const remaining = remainingRefundableCents(payment.amountCents, payment.refunds);
  // Full name and email only for roles that act on refunds; everyone else sees them masked.
  const showPii = can(user, "refunds.create");
  const email = showPii ? payment.customer.email : maskEmail(payment.customer.email);
  const customerName = showPii ? payment.customer.name : maskName(payment.customer.name);

  const facts: [string, React.ReactNode][] = [
    ["Customer", customerName],
    ["Email", email],
    ["Card", <span key="card" className="font-mono">{maskCard(payment.cardLast4)}</span>],
    ["Amount", formatMoney(payment.amountCents, payment.currency)],
    ["Remaining refundable", formatMoney(remaining, payment.currency)],
    ["Status", <StatusBadge key="status" status={payment.status} />],
    ["Created", formatDateTime(payment.createdAt)],
    ["Payment ID", <span key="id" className="font-mono text-xs">{payment.id}</span>],
  ];

  return (
    <div>
      <Link href="/refunds" className="text-sm text-muted-foreground hover:underline">← All payments</Link>
      <PageHeader title={`Payment ${formatMoney(payment.amountCents, payment.currency)}`} description={customerName} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Refund history</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payment.refunds.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No refunds yet.</TableCell></TableRow>
                  )}
                  {payment.refunds.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell>{formatMoney(r.amountCents, payment.currency)}</TableCell>
                      <TableCell>{r.reason.replace(/_/g, " ")}</TableCell>
                      <TableCell>{r.requestedBy.email}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                        {r.outcomeUnknown && (
                          <div className="mt-1 space-y-1">
                            <p className="text-xs text-destructive">Processor outcome unknown; amount stays reserved.</p>
                            <Can permission="refunds.approve_large">
                              <ReconcileRefundButton refundId={r.id} />
                            </Can>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <Can permission="refunds.create">
          <Card className="h-fit">
            <CardHeader><CardTitle>Issue refund</CardTitle></CardHeader>
            <CardContent>
              {payment.status === "failed" || remaining === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing left to refund on this payment.</p>
              ) : (
                <IssueRefundForm
                  paymentId={payment.id}
                  remainingLabel={formatMoney(remaining, payment.currency)}
                  thresholdLabel={formatMoney(LARGE_REFUND_THRESHOLD_CENTS, payment.currency)}
                />
              )}
            </CardContent>
          </Card>
        </Can>
      </div>
    </div>
  );
}
