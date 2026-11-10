import { permissionsFor, type Permission, type Role } from "./permissions";

export function can(user: { role: Role } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return permissionsFor(user.role).includes(permission);
}
