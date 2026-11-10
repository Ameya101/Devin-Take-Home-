import { registerApprovalType } from "@/kit/approvals/registry";
import { formatMoney } from "@/kit/ui/money";
import { REFUND_LARGE_APPROVAL } from "./config";
import { markRefundRejected, processRefund, type RefundLargePayload } from "./service";

registerApprovalType<RefundLargePayload>(REFUND_LARGE_APPROVAL, {
  permissionToApprove: "refunds.approve_large",
  describe: (p) => `Refund ${formatMoney(p.amountCents, p.currency)} on payment …${p.paymentId.slice(-6)} (${p.reason.replace(/_/g, " ")})`,
  execute: async (p, tx, { approver }) => {
    const refund = await processRefund(tx, p.refundId, approver);
    return { refundId: refund.id, providerRefundId: refund.providerRefundId };
  },
  onReject: (p, tx, { approver }) => markRefundRejected(tx, p.refundId, approver),
  // Release the reserved amount so the payment can be refunded again. The adapter is called with
  // the refund id as idempotency key, so a provider-side success is never repeated by a new request.
  onFailure: (p, tx, { approver }) => markRefundRejected(tx, p.refundId, approver, "refund.execution_failed"),
});
