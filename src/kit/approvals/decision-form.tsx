"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideApprovalAction } from "./actions";

export function DecisionForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(decideApprovalAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Input name="note" placeholder="Decision note" className="h-8 w-44" maxLength={500} />
      <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>
        Approve
      </Button>
      <Button type="submit" name="decision" value="reject" size="sm" variant="destructive" disabled={pending}>
        Reject
      </Button>
      {state && !state.ok && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
