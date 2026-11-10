"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createFlagAction } from "../actions";

export function CreateFlagForm({ ownerTeams }: { ownerTeams: readonly string[] }) {
  const [state, formAction, pending] = useActionState(createFlagAction, null);
  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="key">Key</Label>
        <Input id="key" name="key" placeholder="checkout.new-payment-sheet" required className="font-mono" />
        <p className="text-xs text-muted-foreground">Lowercase, segments separated by &quot;.&quot;, &quot;-&quot; or &quot;_&quot;. Cannot be changed later.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" required maxLength={500} placeholder="What the flag gates and when it can be removed" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ownerTeam">Owner team</Label>
        <select id="ownerTeam" name="ownerTeam" required defaultValue="" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="" disabled>Pick a team…</option>
          {ownerTeams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">New flags start off at 0% in dev, staging and prod.</p>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create flag"}</Button>
      {state && !state.ok && <p role="status" className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
