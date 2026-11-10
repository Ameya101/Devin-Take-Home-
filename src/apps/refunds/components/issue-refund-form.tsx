"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { issueRefundAction } from "../actions";
import { REFUND_REASONS } from "../config";

export function IssueRefundForm({ paymentId, remainingLabel, thresholdLabel }: { paymentId: string; remainingLabel: string; thresholdLabel: string }) {
  const [state, formAction, pending] = useActionState(issueRefundAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="space-y-1.5">
        <Label htmlFor="amount">Amount (USD)</Label>
        <Input id="amount" name="amount" inputMode="decimal" placeholder="50.00" required />
        <p className="text-xs text-muted-foreground">
          Remaining refundable: {remainingLabel}. Over {thresholdLabel} needs finance approval.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reason">Reason</Label>
        <select id="reason" name="reason" required className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
          {REFUND_REASONS.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" name="note" maxLength={500} placeholder="Optional context for the audit trail" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Issue refund"}
      </Button>
      {state && (
        <p role="status" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-destructive"}>
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}
