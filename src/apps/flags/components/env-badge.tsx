import { cn } from "@/lib/utils";
import type { EnvState } from "../policy";

/** Server-renderable badge: green when on, gray when off. */
export function EnvBadge({ state, className }: { state: EnvState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        state.enabled ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-zinc-50 text-zinc-500 ring-zinc-500/20",
        className,
      )}
    >
      {state.enabled ? `on · ${state.rolloutPercent}%` : "off"}
    </span>
  );
}
