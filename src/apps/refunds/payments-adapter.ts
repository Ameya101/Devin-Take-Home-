import { appendFileSync, existsSync, readFileSync } from "node:fs";

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

export type RefundLookup =
  | { status: "succeeded"; providerRefundId: string }
  | { status: "not_found" }
  /** The processor cannot say either way; keep the amount reserved and investigate. */
  | { status: "unknown"; reason: string };

/** Thrown only when the processor confirms no refund was issued. Any other error means the outcome is unknown. */
export class RefundDeclinedError extends Error {}

/**
 * The mock "processor's" own record of issued refunds: an append-only JSONL file, outside the database on
 * purpose (a rolled-back transaction does not undo a refund the processor already issued) and durable across
 * restarts. It is never rewritten or expired, so a missing key really means "never issued". A damaged line
 * (e.g. a crash mid-append) is skipped; while one exists a missing key is reported as "unknown", not "not_found",
 * and new refunds are refused so a retry can't issue a refund that is hiding in the damaged line.
 */
type IssuedRefund = { idempotencyKey: string; providerRefundId: string; issuedAt: string };

const logPath = () => process.env.MOCK_PAYMENTS_LOG ?? ".mock-payments.jsonl";

function readLog(): { issued: IssuedRefund[]; damaged: number } {
  if (!existsSync(logPath())) return { issued: [], damaged: 0 };
  const issued: IssuedRefund[] = [];
  let damaged = 0;
  for (const line of readFileSync(logPath(), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as Partial<IssuedRefund>;
      if (typeof r.idempotencyKey === "string" && typeof r.providerRefundId === "string") issued.push(r as IssuedRefund);
      else damaged++;
    } catch {
      damaged++;
    }
  }
  return { issued, damaged };
}

function appendIssued(record: IssuedRefund): void {
  // Start on a fresh line if a previous append was cut off, so the new record stays parseable.
  const needsNewline = existsSync(logPath()) && !readFileSync(logPath(), "utf8").endsWith("\n") && readFileSync(logPath(), "utf8").length > 0;
  appendFileSync(logPath(), (needsNewline ? "\n" : "") + JSON.stringify(record) + "\n");
}

export class MockPaymentsAdapter implements PaymentsAdapter {
  async refund(input: { paymentId: string; amountCents: number; currency: string; idempotencyKey: string }) {
    const { issued, damaged } = readLog();
    const existing = issued.find((r) => r.idempotencyKey === input.idempotencyKey);
    if (existing) return { providerRefundId: existing.providerRefundId };
    if (damaged > 0) {
      // The key may be in a damaged record, so issuing now could refund twice. Refuse until the record is repaired.
      throw new Error(`Processor record has ${damaged} damaged entr${damaged === 1 ? "y" : "ies"}; refusing to issue a refund that may already exist`);
    }
    const providerRefundId = `re_mock_${input.idempotencyKey.slice(-12)}`;
    const record: IssuedRefund = { idempotencyKey: input.idempotencyKey, providerRefundId, issuedAt: new Date().toISOString() };
    appendIssued(record);
    if (process.env.NODE_ENV !== "test") {
      console.info(`[MockPaymentsAdapter] refund ${input.amountCents} ${input.currency} on ${input.paymentId} -> ${providerRefundId}`);
    }
    return { providerRefundId };
  }

  async lookupRefund(input: { idempotencyKey: string }): Promise<RefundLookup> {
    const { issued, damaged } = readLog();
    const hit = issued.find((r) => r.idempotencyKey === input.idempotencyKey);
    if (hit) return { status: "succeeded", providerRefundId: hit.providerRefundId };
    return damaged > 0 ? { status: "unknown", reason: `${damaged} damaged processor record(s)` } : { status: "not_found" };
  }
}

export function getPaymentsAdapter(): PaymentsAdapter {
  const kind = process.env.PAYMENTS_ADAPTER ?? "mock";
  if (kind === "mock") return new MockPaymentsAdapter();
  throw new Error(`Unknown PAYMENTS_ADAPTER "${kind}"`);
}
