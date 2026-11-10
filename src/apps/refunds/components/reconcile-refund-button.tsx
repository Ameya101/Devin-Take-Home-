"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { reconcileRefundAction } from "../actions";

export function ReconcileRefundButton({ refundId }: { refundId: string }) {
  const [state, formAction, pending] = useActionState(reconcileRefundAction, null);
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="refundId" value={refundId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Checking…" : "Check with processor"}
      </Button>
      {state && (
        <p role="status" className={state.ok ? "text-xs text-emerald-700" : "text-xs text-destructive"}>
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}
