export const ENVIRONMENTS = ["dev", "staging", "prod"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** Environments an eng_admin may change directly. Everything else goes through approval. */
export const DIRECT_ENVIRONMENTS = ["dev", "staging"] as const;

export const OWNER_TEAMS = [
  "payments",
  "ledger",
  "risk",
  "onboarding",
  "cards",
  "money-movement",
  "growth",
  "platform",
  "mobile",
  "support-tools",
] as const;
export type OwnerTeam = (typeof OWNER_TEAMS)[number];

/** Lowercase segments separated by ".", "-" or "_", e.g. "checkout.new-payment-sheet". */
export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[.\-_][a-z0-9]+)*$/;

export const FLAG_PROD_CHANGE_APPROVAL = "flag.prod_change";
export const FLAG_KILL_SWITCH_APPROVAL = "flag.prod_kill_switch";

/** entityType used for every audit event about a flag, so the per-flag history is one query. */
export const FLAG_ENTITY = "FeatureFlag";
