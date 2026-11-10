import type { ReactNode } from "react";
import { getCurrentUser } from "@/kit/auth/current-user";
import { can } from "./can";
import type { Permission } from "./permissions";

/** UI convenience only: hides children the user can't use. NOT access control; use withPermission on the server. */
export async function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const user = await getCurrentUser();
  return can(user, permission) ? children : fallback;
}
