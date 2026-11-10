"use server";

import "@/apps/approval-types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/kit/actions";
import { withPermission } from "@/kit/rbac/with-permission";
import { formatState } from "./policy";
import { createFlagSchema, directChangeFormSchema, killSwitchFormSchema, prodChangeFormSchema } from "./schema";
import { createFlag, requestKillSwitch, requestProdChange, setDirectState } from "./service";

const create = withPermission("flags.create", async (user, formData: FormData) => {
  const input = createFlagSchema.parse({
    key: formData.get("key"),
    description: formData.get("description"),
    ownerTeam: formData.get("ownerTeam"),
  });
  const flag = await createFlag(user, input);
  revalidatePath("/flags");
  return flag.id;
});

export async function createFlagAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let flagId: string | null = null;
  const state = await runAction(async () => {
    flagId = await create(formData);
    return "Flag created";
  });
  if (flagId) redirect(`/flags/${flagId}`);
  return state;
}

const setDirect = withPermission("flags.edit_nonprod", async (user, formData: FormData) => {
  const input = directChangeFormSchema.parse({
    flagId: formData.get("flagId"),
    environment: formData.get("environment"),
    enabled: formData.get("enabled"),
    rolloutPercent: formData.get("rolloutPercent"),
  });
  const env = await setDirectState(user, input);
  revalidatePath(`/flags/${input.flagId}`);
  return `${input.environment} is now ${formatState(env)}`;
});

export async function setDirectStateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => setDirect(formData));
}

const requestProd = withPermission("flags.request_prod", async (user, formData: FormData) => {
  const input = prodChangeFormSchema.parse({
    flagId: formData.get("flagId"),
    enabled: formData.get("enabled"),
    rolloutPercent: formData.get("rolloutPercent"),
    reason: formData.get("reason") || undefined,
  });
  await requestProdChange(user, input);
  revalidatePath(`/flags/${input.flagId}`);
  return "Prod change sent for approval by a different eng_admin";
});

export async function requestProdChangeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => requestProd(formData));
}

const killSwitch = withPermission("flags.request_prod", async (user, formData: FormData) => {
  const input = killSwitchFormSchema.parse({ flagId: formData.get("flagId"), reason: formData.get("reason") });
  await requestKillSwitch(user, input);
  revalidatePath(`/flags/${input.flagId}`);
  return "Kill switch sent for approval as URGENT";
});

export async function requestKillSwitchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(() => killSwitch(formData));
}
