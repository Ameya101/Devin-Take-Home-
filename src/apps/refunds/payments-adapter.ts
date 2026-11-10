/** Boundary to the payment processor. A real Stripe/Adyen implementation goes behind this interface. */
export interface PaymentsAdapter {
  refund(input: {
    paymentId: string;
    amountCents: number;
    currency: string;
    /** Use the Refund id so retries never double-refund. */
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string }>;
  /** Looks up a refund by idempotency key, to settle a call whose outcome was unknown. */
  lookupRefund(input: { idempotencyKey: string }): Promise<RefundLookup>;
}

export type RefundLookup = { status: "succeeded"; providerRefundId: string } | { status: "not_found" };

/** Thrown only when the processor confirms no refund was issued. Any other error means the outcome is unknown. */
export class RefundDeclinedError extends Error {}

/**
 * The mock "processor's" own record of issued refunds, keyed by idempotency key. It lives outside the
 * database on purpose: a rolled-back transaction does not undo a refund the processor already issued.
 */
const issuedRefunds = new Map<string, string>();

export class MockPaymentsAdapter implements PaymentsAdapter {
  async refund(input: { paymentId: string; amountCents: number; currency: string; idempotencyKey: string }) {
    const existing = issuedRefunds.get(input.idempotencyKey);
    if (existing) return { providerRefundId: existing };
    const providerRefundId = `re_mock_${input.idempotencyKey.slice(-12)}`;
    issuedRefunds.set(input.idempotencyKey, providerRefundId);
    if (process.env.NODE_ENV !== "test") {
      console.info(`[MockPaymentsAdapter] refund ${input.amountCents} ${input.currency} on ${input.paymentId} -> ${providerRefundId}`);
    }
    return { providerRefundId };
  }

  async lookupRefund(input: { idempotencyKey: string }): Promise<RefundLookup> {
    const providerRefundId = issuedRefunds.get(input.idempotencyKey);
    return providerRefundId ? { status: "succeeded", providerRefundId } : { status: "not_found" };
  }
}

export function getPaymentsAdapter(): PaymentsAdapter {
  const kind = process.env.PAYMENTS_ADAPTER ?? "mock";
  if (kind === "mock") return new MockPaymentsAdapter();
  throw new Error(`Unknown PAYMENTS_ADAPTER "${kind}"`);
}
