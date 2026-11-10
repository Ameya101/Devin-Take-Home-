import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
  gray: "bg-zinc-50 text-zinc-700 ring-zinc-500/20",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  succeeded: "green", processed: "green", executed: "green", approved: "green",
  pending: "amber", pending_approval: "amber", requested: "amber", partially_refunded: "blue",
  refunded: "gray", rejected: "red", failed: "red", urgent: "red",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONES[STATUS_TONE[status] ?? "gray"];
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone, className)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
