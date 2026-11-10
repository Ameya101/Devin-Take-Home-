import type { AuditEvent } from "@prisma/client";
import { formatState, type EnvState } from "./policy";

const LABELS: Record<string, string> = {
  "flag.created": "Created",
  "flag.env_updated": "Changed",
  "flag.prod_change_requested": "Prod change requested",
  "flag.prod_change_rejected": "Prod change rejected",
  "flag.kill_switch_requested": "Kill switch requested",
  "flag.kill_switch_executed": "Kill switch executed",
  "flag.kill_switch_rejected": "Kill switch rejected",
  "flag.prod_change_failed": "Prod change failed",
  "flag.kill_switch_failed": "Kill switch failed",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const asState = (v: Obj): EnvState => ({ enabled: Boolean(v.enabled), rolloutPercent: Number(v.rolloutPercent ?? 0) });

/** One line per audit event for the per-flag history table. */
export function summarizeFlagEvent(e: Pick<AuditEvent, "action" | "before" | "after" | "metadata">): {
  label: string;
  environment: string;
  change: string;
} {
  const before = obj(e.before);
  const after = obj(e.after);
  const meta = obj(e.metadata);
  const label = LABELS[e.action] ?? e.action;
  const environment = String(meta.environment ?? after.environment ?? "—");
  let change = "";
  switch (e.action) {
    case "flag.created":
      change = `key ${String(after.key)}, owner ${String(after.ownerTeam)}; all environments off`;
      break;
    case "flag.env_updated":
    case "flag.kill_switch_executed":
      change = `${formatState(asState(before))} → ${formatState(asState(after))}${meta.route === "approval" ? " (approved)" : ""}`;
      break;
    case "flag.prod_change_requested":
    case "flag.kill_switch_requested":
      change = `${formatState({ enabled: Boolean(after.fromEnabled), rolloutPercent: Number(after.fromRolloutPercent) })} → ${formatState({ enabled: Boolean(after.toEnabled), rolloutPercent: Number(after.toRolloutPercent) })}${after.reason ? ` · “${String(after.reason)}”` : ""}`;
      break;
    case "flag.prod_change_rejected":
    case "flag.kill_switch_rejected":
      change = meta.note ? `“${String(meta.note)}”` : "";
      break;
    case "flag.prod_change_failed":
    case "flag.kill_switch_failed":
      change = "approved, but prod had changed since the request; nothing applied";
      break;
  }
  return { label, environment, change };
}
