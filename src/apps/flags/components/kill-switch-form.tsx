"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestKillSwitchAction } from "../actions";

export function KillSwitchForm({ flagId }: { flagId: string }) {
  const [state, formAction, pending] = useActionState(requestKillSwitchAction, null);
  return (
    <form action={formAction} className="space-y-2" data-testid="kill-switch-form">
      <input type="hidden" name="flagId" value={flagId} />
      <Input name="reason" required minLength={5} maxLength={500} placeholder="Reason, e.g. error rate spike in checkout" />
      <Button type="submit" size="sm" variant="destructive" disabled={pending} className="w-full">
        {pending ? "Requesting…" : "Kill switch: turn OFF in prod"}
      </Button>
      {state && (
        <p role="status" className={state.ok ? "text-xs text-emerald-700" : "text-xs text-destructive"}>
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}
