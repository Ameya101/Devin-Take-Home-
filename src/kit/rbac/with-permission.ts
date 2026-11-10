import { getCurrentUser } from "@/kit/auth/current-user";
import type { SessionUser } from "@/kit/auth/types";
import { assertCan } from "./assert";
import type { Permission } from "./permissions";

/**
 * Wrap every server action, route handler and data loader with this.
 * Resolves the current user, enforces `permission` on the server, and on failure
 * writes an "access_denied" audit event and throws ForbiddenError (status 403).
 */
export function withPermission<A extends unknown[], R>(
  permission: Permission,
  handler: (user: SessionUser, ...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const user = await assertCan(await getCurrentUser(), permission);
    return handler(user, ...args);
  };
}
