import type { Environment } from "./config";

export type FlagChangeRoute = "apply_directly" | "requires_approval";

/** dev and staging change immediately; any prod change needs a different eng_admin to approve. */
export function routeFlagChange(environment: Environment): FlagChangeRoute {
  return environment === "prod" ? "requires_approval" : "apply_directly";
}

export type EnvState = { enabled: boolean; rolloutPercent: number };

export function stateOf(s: EnvState): EnvState {
  return { enabled: s.enabled, rolloutPercent: s.rolloutPercent };
}

export function sameState(a: EnvState, b: EnvState): boolean {
  return a.enabled === b.enabled && a.rolloutPercent === b.rolloutPercent;
}

/** "on · 25%" or "off" (the stored rollout is kept while off, but nobody gets the flag). */
export function formatState(s: EnvState): string {
  return s.enabled ? `on · ${s.rolloutPercent}%` : "off";
}

/** Share of traffic that actually sees the flag. */
export function effectiveRollout(s: EnvState): number {
  return s.enabled ? s.rolloutPercent : 0;
}

export type FlagChangeKind = "change" | "kill_switch";

/**
 * A prod change is applied only if prod still looks like it did when the change was requested,
 * so an old pending change can never silently undo a kill switch or a newer change.
 * A kill switch always applies (turning a flag off is always safe to do).
 */
export function canApplyProdChange(kind: FlagChangeKind, requestedFrom: EnvState, current: EnvState): boolean {
  return kind === "kill_switch" || sameState(requestedFrom, current);
}
