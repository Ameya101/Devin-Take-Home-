import { LARGE_REFUND_THRESHOLD_CENTS } from "./config";

export type RefundRoute = "process_immediately" | "requires_approval";

export function routeRefund(amountCents: number): RefundRoute {
  return amountCents > LARGE_REFUND_THRESHOLD_CENTS ? "requires_approval" : "process_immediately";
}

type RefundLike = { amountCents: number; status: string };

/** Pending and processed refunds both count against the payment, so two requests can't over-refund it. */
export function remainingRefundableCents(paymentAmountCents: number, refunds: RefundLike[]): number {
  const reserved = refunds
    .filter((r) => r.status !== "rejected")
    .reduce((sum, r) => sum + r.amountCents, 0);
  return Math.max(0, paymentAmountCents - reserved);
}

export function paymentStatusAfterRefunds(paymentAmountCents: number, refunds: RefundLike[]): string {
  const processed = refunds.filter((r) => r.status === "processed").reduce((s, r) => s + r.amountCents, 0);
  if (processed === 0) return "succeeded";
  return processed >= paymentAmountCents ? "refunded" : "partially_refunded";
}
