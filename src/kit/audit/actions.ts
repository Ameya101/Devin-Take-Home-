"use server";

import { withPermission } from "@/kit/rbac/with-permission";
import { audit, type ChainVerification } from "./audit";

const verify = withPermission("audit.view", async () => audit.verifyChain());

export async function verifyIntegrityAction(): Promise<ChainVerification> {
  return verify();
}
