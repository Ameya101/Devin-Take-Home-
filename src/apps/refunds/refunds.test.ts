import { describe, expect, it } from "vitest";
import "@/apps/approval-types";
import { makePayment, makeUser } from "../../../tests/helpers";
import { approve } from "@/kit/approvals/service";
import { audit } from "@/kit/audit/audit";
import { prisma } from "@/kit/db";
import { ForbiddenError } from "@/kit/errors";
import { LARGE_REFUND_THRESHOLD_CENTS } from "./config";
import { remainingRefundableCents, routeRefund } from "./policy";
import { refundFormSchema } from "./schema";
import { issueRefund } from "./service";

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

  it("rejects refunds above the remaining refundable amount", async () => {
    const agent = await makeUser("support_agent");
    const payment = await makePayment(10_000);
    await expect(issueRefund(agent, { paymentId: payment.id, amountCents: 10_001, reason: "duplicate" })).rejects.toThrow(/remaining refundable/);
  });
});
