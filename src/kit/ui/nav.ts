import { apps } from "@/apps/registry";
import type { SessionUser } from "@/kit/auth/types";
import { can } from "@/kit/rbac/can";
import type { Permission } from "@/kit/rbac/permissions";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; permission: Permission };

const KIT_NAV: NavItem[] = [
  { href: "/approvals", label: "Approvals", icon: "approvals", permission: "approvals.view" },
  { href: "/admin/audit", label: "Audit log", icon: "audit", permission: "audit.view" },
];

/** Left-nav entries: every registered app plus kit pages, filtered by the user's permissions. */
export function navFor(user: SessionUser): { apps: NavItem[]; kit: NavItem[] } {
  const appItems: NavItem[] = apps.map((a) => ({ href: a.basePath, label: a.name, icon: a.icon, permission: a.navPermission }));
  return {
    apps: appItems.filter((i) => can(user, i.permission)),
    kit: KIT_NAV.filter((i) => can(user, i.permission)),
  };
}
