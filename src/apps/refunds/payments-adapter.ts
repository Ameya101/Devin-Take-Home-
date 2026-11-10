/** Boundary to the payment processor. A real Stripe/Adyen implementation goes behind this interface. */
export interface PaymentsAdapter {
  refund(input: {
    paymentId: string;
    amountCents: number;
    currency: string;
    /** Use the Refund id so retries never double-refund. */
    idempotencyKey: string;
  }): Promise<{ providerRefundId: string }>;
}

export class MockPaymentsAdapter implements PaymentsAdapter {
  async refund(input: { paymentId: string; amountCents: number; currency: string; idempotencyKey: string }) {
    const providerRefundId = `re_mock_${input.idempotencyKey.slice(-12)}`;
    if (process.env.NODE_ENV !== "test") {
      console.info(`[MockPaymentsAdapter] refund ${input.amountCents} ${input.currency} on ${input.paymentId} -> ${providerRefundId}`);
    }
    return { providerRefundId };
  }
}

export function getPaymentsAdapter(): PaymentsAdapter {
  const kind = process.env.PAYMENTS_ADAPTER ?? "mock";
  if (kind === "mock") return new MockPaymentsAdapter();
  throw new Error(`Unknown PAYMENTS_ADAPTER "${kind}"`);
}
