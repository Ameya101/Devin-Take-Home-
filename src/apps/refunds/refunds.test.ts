import { describe, expect, it, vi } from "vitest";
import "@/apps/approval-types";
import { makePayment, makeUser } from "../../../tests/helpers";
import { approve } from "@/kit/approvals/service";
import { audit } from "@/kit/audit/audit";
import { prisma } from "@/kit/db";
import { ConflictError, ForbiddenError } from "@/kit/errors";
import { LARGE_REFUND_THRESHOLD_CENTS } from "./config";
import { remainingRefundableCents, routeRefund } from "./policy";
import { refundFormSchema } from "./schema";
import { MockPaymentsAdapter, RefundDeclinedError } from "./payments-adapter";
import { issueRefund, reconcileRefund } from "./service";

describe("refund threshold routing", () => {
  it("routes by the single threshold constant", () => {
    expect(LARGE_REFUND_THRESHOLD_CENTS).toBe(50_000);
    expect(routeRefund(5_000)).toBe("process_immediately");
    expect(routeRefund(50_000)).toBe("process_immediately");
    expect(routeRefund(50_001)).toBe("requires_approval");
  });

  it("counts pending and processed refunds against the payment, not rejected ones", () => {
    expect(remainingRefundableCents(10_000, [
      { amountCents: 2_000, status: "processed" },
      { amountCents: 3_000, status: "pending_approval" },
      { amountCents: 4_000, status: "rejected" },
    ])).toBe(5_000);
  });

  it("parses dollars into integer cents and rejects non-positive amounts", () => {
    expect(refundFormSchema.parse({ paymentId: "p", amount: "900.5", reason: "duplicate" }).amount).toBe(90_050);
    expect(refundFormSchema.safeParse({ paymentId: "p", amount: "0", reason: "duplicate" }).success).toBe(false);
    expect(refundFormSchema.safeParse({ paymentId: "p", amount: "1.234", reason: "duplicate" }).success).toBe(false);
  });

  it("accepts commas only as thousands separators", () => {
    const parse = (amount: string) => refundFormSchema.safeParse({ paymentId: "p", amount, reason: "duplicate" });
    expect(parse("1,000.00").data?.amount).toBe(100_000);
    expect(parse("1,234,567").data?.amount).toBe(123_456_700);
    for (const bad of ["1,00", "1,2", "12,34.00", ",100", "1,0000"]) expect(parse(bad).success).toBe(false);
  });

  it("$50 by an agent is processed immediately", async () => {
    const agent = await makeUser("support_agent");
    const payment = await makePayment(200_000);
    const { refund, route } = await issueRefund(agent, { paymentId: payment.id, amountCents: 5_000, reason: "duplicate" });
    expect(route).toBe("process_immediately");
    expect(refund.status).toBe("processed");
    expect(refund.providerRefundId).toMatch(/^re_mock_/);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("partially_refunded");
  });

  it("$900 goes to a refund.large approval that only a different finance_approver can approve", async () => {
    const agent = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const payment = await makePayment(200_000);

    const { refund, route } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "requested_by_customer" });
    expect(route).toBe("requires_approval");
    expect(refund.status).toBe("pending_approval");
    expect(refund.approvalRequestId).toBeTruthy();

    await expect(approve(refund.approvalRequestId!, agent)).rejects.toBeInstanceOf(ForbiddenError);
    await approve(refund.approvalRequestId!, approver);

    const processed = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(processed.status).toBe("processed");
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });

  it("a confirmed processor decline fails the approval and releases the reserved amount", async () => {
    const agent = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const payment = await makePayment(90_000);
    const { refund } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });

    const spy = vi.spyOn(MockPaymentsAdapter.prototype, "refund").mockRejectedValueOnce(new RefundDeclinedError("card_closed"));
    await expect(approve(refund.approvalRequestId!, approver)).rejects.toThrow(/execution failed/);
    spy.mockRestore();

    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: refund.approvalRequestId! } })).status).toBe("failed");
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("rejected");
    const retry = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });
    expect(retry.route).toBe("requires_approval");
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });

  it("an unknown processor outcome keeps the amount reserved so it cannot be refunded twice", async () => {
    const agent = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const payment = await makePayment(90_000);
    const { refund } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });

    const spy = vi.spyOn(MockPaymentsAdapter.prototype, "refund").mockRejectedValueOnce(new Error("timeout"));
    await expect(approve(refund.approvalRequestId!, approver)).rejects.toThrow(/execution failed/);
    spy.mockRestore();

    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("pending_approval");
    expect(await prisma.auditEvent.count({ where: { action: "refund.outcome_unknown", entityId: refund.id } })).toBe(1);
    await expect(issueRefund(agent, { paymentId: payment.id, amountCents: 1, reason: "duplicate" })).rejects.toThrow(/remaining refundable/);
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });

  async function refundWithUnknownOutcome() {
    const agent = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const payment = await makePayment(90_000);
    const { refund } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });
    const spy = vi.spyOn(MockPaymentsAdapter.prototype, "refund").mockRejectedValueOnce(new Error("timeout"));
    await expect(approve(refund.approvalRequestId!, approver)).rejects.toThrow(/execution failed/);
    spy.mockRestore();
    return { agent, approver, payment, refund };
  }

  it("reconciling an unknown outcome the processor never issued releases the amount", async () => {
    const { agent, approver, payment, refund } = await refundWithUnknownOutcome();
    expect((await reconcileRefund(approver, refund.id)).status).toBe("rejected");
    expect(await prisma.auditEvent.count({ where: { action: "refund.reconciled_not_refunded", entityId: refund.id } })).toBe(1);
    await expect(issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" })).resolves.toBeTruthy();
    await expect(reconcileRefund(approver, refund.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("reconciling an unknown outcome the processor did issue marks it processed without a second refund", async () => {
    const { approver, payment, refund } = await refundWithUnknownOutcome();
    const refundCall = vi.spyOn(MockPaymentsAdapter.prototype, "refund");
    const lookup = vi.spyOn(MockPaymentsAdapter.prototype, "lookupRefund").mockResolvedValueOnce({ status: "succeeded", providerRefundId: "re_found_1" });
    const settled = await reconcileRefund(approver, refund.id);
    lookup.mockRestore();
    expect(refundCall).not.toHaveBeenCalled();
    refundCall.mockRestore();
    expect(settled).toMatchObject({ status: "processed", providerRefundId: "re_found_1" });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("refunded");
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });

  it("reconciles a refund the processor issued before the database write failed, without refunding twice", async () => {
    const agent = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const payment = await makePayment(90_000);
    const { refund } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });

    // The processor call succeeds, then the surrounding transaction fails, rolling back our records.
    const real = MockPaymentsAdapter.prototype.refund;
    const spy = vi.spyOn(MockPaymentsAdapter.prototype, "refund").mockImplementationOnce(async function (this: MockPaymentsAdapter, input) {
      await real.call(this, input);
      throw new Error("connection reset after processor call");
    });
    await expect(approve(refund.approvalRequestId!, approver)).rejects.toThrow(/execution failed/);
    spy.mockRestore();

    const refundCalls = vi.spyOn(MockPaymentsAdapter.prototype, "refund");
    const settled = await reconcileRefund(approver, refund.id);
    expect(refundCalls).not.toHaveBeenCalled();
    refundCalls.mockRestore();
    expect(settled).toMatchObject({ status: "processed", providerRefundId: expect.stringMatching(/^re_mock_/) });
    await expect(issueRefund(agent, { paymentId: payment.id, amountCents: 1, reason: "duplicate" })).rejects.toThrow(/remaining refundable/);
  });

  it("the mock processor's record survives a restart and is never expired", async () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    await new MockPaymentsAdapter().refund({ paymentId: "p", amountCents: 100, currency: "USD", idempotencyKey: key });
    vi.resetModules();
    const fresh = await import("./payments-adapter");
    vi.useFakeTimers({ now: Date.now() + 400 * 24 * 3600 * 1000, toFake: ["Date"] });
    expect(await new fresh.MockPaymentsAdapter().lookupRefund({ idempotencyKey: key })).toMatchObject({ status: "succeeded" });
    vi.useRealTimers();
    expect(await new fresh.MockPaymentsAdapter().lookupRefund({ idempotencyKey: `${key}-other` })).toEqual({ status: "not_found" });
  });

  it("a damaged processor record makes misses 'unknown' and refuses new refunds, but retries stay idempotent", async () => {
    const { appendFileSync } = await import("node:fs");
    const log = process.env.MOCK_PAYMENTS_LOG!;
    const key = `before-damage-${Date.now()}`;
    const first = await new MockPaymentsAdapter().refund({ paymentId: "p", amountCents: 100, currency: "USD", idempotencyKey: key });
    appendFileSync(log, '{"idempotencyKey":"cut-off');
    expect(await new MockPaymentsAdapter().refund({ paymentId: "p", amountCents: 100, currency: "USD", idempotencyKey: key })).toEqual(first);
    expect(await new MockPaymentsAdapter().lookupRefund({ idempotencyKey: key })).toMatchObject({ status: "succeeded" });
    await expect(
      new MockPaymentsAdapter().refund({ paymentId: "p", amountCents: 100, currency: "USD", idempotencyKey: "cut-off" }),
    ).rejects.toThrow(/damaged/);
    expect(await new MockPaymentsAdapter().lookupRefund({ idempotencyKey: "cut-off" })).toMatchObject({ status: "unknown" });

    const agent = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const payment = await makePayment(200_000);
    const { refund } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });
    vi.spyOn(MockPaymentsAdapter.prototype, "refund").mockRejectedValueOnce(new Error("timeout"));
    await expect(approve(refund.approvalRequestId!, approver)).rejects.toThrow(/execution failed/);
    await expect(reconcileRefund(approver, refund.id)).rejects.toThrow(/manual investigation/);
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("pending_approval");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(log, "");
  });

  it("only refunds with an unknown outcome can be reconciled", async () => {
    const agent = await makeUser("support_agent");
    const payment = await makePayment(200_000);
    const { refund } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });
    await expect(reconcileRefund(agent, refund.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("concurrent refunds on one payment can never exceed its amount (payment row is locked)", async () => {
    const agent = await makeUser("support_agent");
    const payment = await makePayment(40_000);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => issueRefund(agent, { paymentId: payment.id, amountCents: 30_000, reason: "duplicate" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refunded = await prisma.refund.aggregate({ where: { paymentId: payment.id, status: { not: "rejected" } }, _sum: { amountCents: true } });
    expect(refunded._sum.amountCents).toBe(30_000);
  });

  it("approving a large refund while new refunds hit the same payment neither deadlocks nor fails", async () => {
    const agent = await makeUser("support_agent");
    const approver = await makeUser("finance_approver");
    const payment = await makePayment(200_000);
    const { refund } = await issueRefund(agent, { paymentId: payment.id, amountCents: 90_000, reason: "duplicate" });
    const results = await Promise.allSettled([
      approve(refund.approvalRequestId!, approver),
      ...Array.from({ length: 3 }, () => issueRefund(agent, { paymentId: payment.id, amountCents: 5_000, reason: "duplicate" })),
    ]);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("processed");
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });

  it("rejects refunds above the remaining refundable amount", async () => {
    const agent = await makeUser("support_agent");
    const payment = await makePayment(10_000);
    await expect(issueRefund(agent, { paymentId: payment.id, amountCents: 10_001, reason: "duplicate" })).rejects.toThrow(/remaining refundable/);
  });
});
