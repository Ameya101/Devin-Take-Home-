import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

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
 * The mock "processor's" own record of issued refunds: an append-only JSONL file, outside the database on
 * purpose (a rolled-back transaction does not undo a refund the processor already issued) and durable across
 * restarts. Like a real processor's idempotency window, entries are kept for a retention period, then pruned.
 */
type IssuedRefund = { idempotencyKey: string; providerRefundId: string; issuedAt: string };

const RETENTION_MS = Number(process.env.MOCK_PAYMENTS_RETENTION_DAYS ?? 30) * 24 * 3600 * 1000;
const logPath = () => process.env.MOCK_PAYMENTS_LOG ?? ".mock-payments.jsonl";

function readIssued(): IssuedRefund[] {
  if (!existsSync(logPath())) return [];
  const cutoff = Date.now() - RETENTION_MS;
  return readFileSync(logPath(), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as IssuedRefund)
    .filter((r) => Date.parse(r.issuedAt) >= cutoff);
}

function findIssued(idempotencyKey: string): IssuedRefund | undefined {
  return readIssued().find((r) => r.idempotencyKey === idempotencyKey);
}

/** Drops entries older than the retention window. Runs once per process start. */
export function pruneMockPaymentsLog(): void {
  if (!existsSync(logPath())) return;
  const kept = readIssued();
  writeFileSync(logPath(), kept.map((r) => JSON.stringify(r) + "\n").join(""));
}
pruneMockPaymentsLog();

export class MockPaymentsAdapter implements PaymentsAdapter {
  async refund(input: { paymentId: string; amountCents: number; currency: string; idempotencyKey: string }) {
    const existing = findIssued(input.idempotencyKey);
    if (existing) return { providerRefundId: existing.providerRefundId };
    const providerRefundId = `re_mock_${input.idempotencyKey.slice(-12)}`;
    const record: IssuedRefund = { idempotencyKey: input.idempotencyKey, providerRefundId, issuedAt: new Date().toISOString() };
    appendFileSync(logPath(), JSON.stringify(record) + "\n");
    if (process.env.NODE_ENV !== "test") {
      console.info(`[MockPaymentsAdapter] refund ${input.amountCents} ${input.currency} on ${input.paymentId} -> ${providerRefundId}`);
    }
    return { providerRefundId };
  }

  async lookupRefund(input: { idempotencyKey: string }): Promise<RefundLookup> {
    const issued = findIssued(input.idempotencyKey);
    return issued ? { status: "succeeded", providerRefundId: issued.providerRefundId } : { status: "not_found" };
  }
}

export function getPaymentsAdapter(): PaymentsAdapter {
  const kind = process.env.PAYMENTS_ADAPTER ?? "mock";
  if (kind === "mock") return new MockPaymentsAdapter();
  throw new Error(`Unknown PAYMENTS_ADAPTER "${kind}"`);
}
