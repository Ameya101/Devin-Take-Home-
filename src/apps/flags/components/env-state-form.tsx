"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestProdChangeAction, setDirectStateAction } from "../actions";

/** "direct" saves dev/staging immediately; "request" sends a prod change for approval. */
export function EnvStateForm({
  flagId,
  environment,
  enabled,
  rolloutPercent,
  mode,
}: {
  flagId: string;
  environment: string;
  enabled: boolean;
  rolloutPercent: number;
  mode: "direct" | "request";
}) {
  const [state, formAction, pending] = useActionState(mode === "direct" ? setDirectStateAction : requestProdChangeAction, null);
  const id = (name: string) => `${environment}-${name}`;
  return (
    <form action={formAction} className="space-y-3" data-testid={`env-form-${environment}`}>
      <input type="hidden" name="flagId" value={flagId} />
      {mode === "direct" && <input type="hidden" name="environment" value={environment} />}
      <div className="flex items-center gap-4">
        <label htmlFor={id("enabled")} className="flex items-center gap-2 text-sm">
          <input id={id("enabled")} type="checkbox" name="enabled" defaultChecked={enabled} className="size-4" />
          Enabled
        </label>
        <div className="flex items-center gap-2">
          <Label htmlFor={id("rollout")} className="text-sm font-normal">Rollout</Label>
          <Input id={id("rollout")} name="rolloutPercent" type="number" min={0} max={100} step={1} defaultValue={rolloutPercent} className="h-8 w-20" required />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
      {mode === "request" && (
        <Textarea name="reason" maxLength={500} placeholder="Why? (shown to the approver and in history)" className="min-h-14" />
      )}
      <Button type="submit" size="sm" variant={mode === "direct" ? "default" : "outline"} disabled={pending}>
        {pending ? "Saving…" : mode === "direct" ? `Save ${environment}` : "Request prod change"}
      </Button>
      {state && (
        <p role="status" className={state.ok ? "text-xs text-emerald-700" : "text-xs text-destructive"}>
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}
