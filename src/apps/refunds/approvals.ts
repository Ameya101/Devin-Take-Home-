import { registerApprovalType } from "@/kit/approvals/registry";
import { formatMoney } from "@/kit/ui/money";
import { REFUND_LARGE_APPROVAL } from "./config";
import { RefundDeclinedError } from "./payments-adapter";
import { flagRefundOutcomeUnknown, markRefundRejected, processRefund, type RefundLargePayload } from "./service";

registerApprovalType<RefundLargePayload>(REFUND_LARGE_APPROVAL, {
  permissionToApprove: "refunds.approve_large",
  describe: (p) => `Refund ${formatMoney(p.amountCents, p.currency)} on payment …${p.paymentId.slice(-6)} (${p.reason.replace(/_/g, " ")})`,
  execute: async (p, tx, { approver }) => {
    const refund = await processRefund(tx, p.refundId, approver);
    return { refundId: refund.id, providerRefundId: refund.providerRefundId };
  },
  onReject: (p, tx, { approver }) => markRefundRejected(tx, p.refundId, approver),
  // Release the reservation only on a confirmed decline. Otherwise the processor may have refunded,
  // so the amount stays reserved (no second refund possible) until it is reconciled by refund id.
  onFailure: (p, tx, { approver, error }) =>
    error instanceof RefundDeclinedError
      ? markRefundRejected(tx, p.refundId, approver, "refund.declined")
      : flagRefundOutcomeUnknown(tx, p.refundId, approver, error instanceof Error ? error.message : String(error)),
});
