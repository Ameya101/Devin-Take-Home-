import { audit } from "@/kit/audit/audit";
import type { SessionUser } from "@/kit/auth/types";
import { prisma } from "@/kit/db";
import { ForbiddenError } from "@/kit/errors";
import { logger } from "@/kit/log";
import { can } from "./can";
import type { Permission } from "./permissions";

type DenialContext = { entityType?: string; entityId?: string; reason?: string };

/** Writes an "access_denied" audit event (in its own transaction) and throws a 403. */
export async function denyAccess(
  user: SessionUser | null,
  permission: Permission,
  context: DenialContext = {},
): Promise<never> {
  await prisma.$transaction((tx) =>
    audit.record(tx, {
      actor: user,
      action: "access_denied",
      entityType: context.entityType ?? "Permission",
      entityId: context.entityId ?? permission,
      metadata: {
        permission,
        role: user?.role ?? null,
        reason: context.reason ?? (user ? "missing_permission" : "unauthenticated"),
      },
    }),
  );
  await logger.warn("access_denied", { permission, userId: user?.id ?? null, role: user?.role ?? null, reason: context.reason ?? null });
  throw new ForbiddenError(
    user ? `Forbidden: ${user.email} lacks "${permission}"` : "Forbidden: not signed in",
  );
}

export async function assertCan(
  user: SessionUser | null,
  permission: Permission,
  context: DenialContext = {},
): Promise<SessionUser> {
  if (user && can(user, permission)) return user;
  return denyAccess(user, permission, context);
}
