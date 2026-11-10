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
});
