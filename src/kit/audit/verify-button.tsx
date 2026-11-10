"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ChainVerification } from "./audit";
import { verifyIntegrityAction } from "./actions";

export function VerifyIntegrityButton() {
  const [result, setResult] = useState<ChainVerification | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3">
      {result &&
        (result.ok ? (
          <span className="text-sm font-medium text-emerald-700">✓ Chain intact: {result.checked} events verified</span>
        ) : (
          <span className="text-sm font-medium text-destructive">
            ✗ Chain broken at event #{result.brokenAt.id} ({result.brokenAt.reason.replace(/_/g, " ")})
          </span>
        ))}
      <Button onClick={() => startTransition(async () => setResult(await verifyIntegrityAction()))} disabled={pending}>
        {pending ? "Verifying…" : "Verify integrity"}
      </Button>
    </div>
  );
}
