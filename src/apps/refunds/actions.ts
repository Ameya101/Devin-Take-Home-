"use server";

import "@/apps/approval-types";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/kit/actions";
import { withPermission } from "@/kit/rbac/with-permission";
import { refundFormSchema } from "./schema";
import { issueRefund, reconcileRefund } from "./service";

const issue = withPermission("refunds.create", async (user, formData: FormData) => {
  const input = refundFormSchema.parse({
    paymentId: formData.get("paymentId"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
    note: formData.get("note") || undefined,
  });
  const { route } = await issueRefund(user, { ...input, amountCents: input.amount });
  revalidatePath(`/refunds/${input.paymentId}`);
  return route === "process_immediately" ? "Refund processed" : "Refund is over the limit and was sent for approval";
});

export async function issueRefundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => issue(formData));
}

const reconcile = withPermission("refunds.approve_large", async (user, formData: FormData) => {
  const refund = await reconcileRefund(user, z.string().min(1).parse(formData.get("refundId")));
  revalidatePath(`/refunds/${refund.paymentId}`);
  return refund.status === "processed"
    ? "Processor confirms the refund was issued; marked processed"
    : "Processor has no record of the refund; the amount is refundable again";
});

export async function reconcileRefundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => reconcile(formData));
}
