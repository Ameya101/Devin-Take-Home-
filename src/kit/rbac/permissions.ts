import { apps } from "@/apps/registry";

export const ROLES = [
  "viewer",
  "support_agent",
  "finance_approver",
  "eng_admin",
  "platform_admin",
] as const;
export type Role = (typeof ROLES)[number];

/** Permissions owned by the kit itself. App permissions come from each app's manifest. */
export const KIT_PERMISSIONS = ["approvals.view", "audit.view"] as const;

type AppPermission = (typeof apps)[number]["permissions"][number];
export type Permission = (typeof KIT_PERMISSIONS)[number] | AppPermission;

export const ALL_PERMISSIONS: readonly Permission[] = [
  ...KIT_PERMISSIONS,
  ...apps.flatMap((app) => app.permissions),
];

/** The single source of truth for role -> permissions. Do not map roles anywhere else. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ["refunds.view"],
  support_agent: ["refunds.view", "refunds.create", "approvals.view"],
  finance_approver: ["refunds.view", "refunds.approve_large", "approvals.view"],
  eng_admin: ["approvals.view"],
  platform_admin: ["refunds.view", "approvals.view", "audit.view"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
