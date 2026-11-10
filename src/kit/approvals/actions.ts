"use server";

import "@/apps/approval-types";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionState } from "@/kit/actions";
import { withPermission } from "@/kit/rbac/with-permission";
import { approve, reject } from "./service";

export const decisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
}).strict();

const decideRequest = withPermission("approvals.view", async (user, formData: FormData) => {
  const input = decisionSchema.parse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (input.decision === "approve") {
    await approve(input.requestId, user, input.note);
  } else {
    await reject(input.requestId, user, input.note);
  }
  revalidatePath("/", "layout");
  return input.decision === "approve" ? "Approved and executed" : "Rejected";
});

export async function decideApprovalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => decideRequest(formData));
}
