"use server";

import "@/apps/approval-types";
import { revalidatePath } from "next/cache";
import { runAction, type ActionState } from "@/kit/actions";
import { withPermission } from "@/kit/rbac/with-permission";
import { refundFormSchema } from "./schema";
import { issueRefund } from "./service";

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
