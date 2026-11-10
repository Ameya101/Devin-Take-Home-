import type { User } from "@prisma/client";
import { isRole } from "@/kit/rbac/permissions";
import type { SessionUser } from "./types";

export function toSessionUser(user: User): SessionUser {
  if (!isRole(user.role)) throw new Error(`User ${user.email} has unknown role "${user.role}"`);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
