import { z } from "zod";
import { DIRECT_ENVIRONMENTS, FLAG_KEY_PATTERN, OWNER_TEAMS } from "./config";

/** HTML checkboxes send "on" when checked and nothing when unchecked. */
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const rolloutSchema = z
  .number({ invalid_type_error: "Rollout must be a number from 0 to 100" })
  .int("Rollout must be a whole number")
  .min(0, "Rollout must be at least 0")
  .max(100, "Rollout must be at most 100");

const rolloutField = z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), rolloutSchema);

export const createFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(3, "Key must be at least 3 characters")
    .max(64, "Key must be at most 64 characters")
    .regex(FLAG_KEY_PATTERN, "Key must be lowercase letters/digits separated by '.', '-' or '_' (e.g. checkout.new-payment-sheet)"),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(500),
  ownerTeam: z.enum(OWNER_TEAMS, { errorMap: () => ({ message: "Pick an owner team" }) }),
});
export type CreateFlagInput = z.infer<typeof createFlagSchema>;

export const envStateSchema = z.object({ enabled: z.boolean(), rolloutPercent: rolloutSchema });

export const directChangeFormSchema = z.object({
  flagId: z.string().min(1),
  environment: z.enum(DIRECT_ENVIRONMENTS),
  enabled: checkbox,
  rolloutPercent: rolloutField,
});

export const prodChangeFormSchema = z.object({
  flagId: z.string().min(1),
  enabled: checkbox,
  rolloutPercent: rolloutField,
  reason: z.string().trim().max(500).optional(),
});

export const killSwitchFormSchema = z.object({
  flagId: z.string().min(1),
  reason: z.string().trim().min(5, "Say why prod needs the kill switch (at least 5 characters)").max(500),
});
