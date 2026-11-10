/** Refunds above this amount (in cents) need a finance_approver. At or below it they process immediately. */
export const LARGE_REFUND_THRESHOLD_CENTS = 50_000; // $500.00

export const REFUND_LARGE_APPROVAL = "refund.large";

export const REFUND_REASONS = [
  "duplicate",
  "fraudulent",
  "requested_by_customer",
  "product_not_received",
  "other",
] as const;

export const PAYMENT_STATUSES = ["succeeded", "partially_refunded", "refunded", "failed"] as const;
