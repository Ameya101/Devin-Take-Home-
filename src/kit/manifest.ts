import type { IconName } from "./ui/icons";

/** Every app exports one of these from src/apps/<app>/manifest.ts and adds it to src/apps/registry.ts. */
export type AppManifest<P extends string = string> = {
  id: string;
  name: string;
  icon: IconName;
  basePath: string;
  /** Permission required to see the app in the left nav. */
  navPermission: NoInfer<P>;
  /** Every permission the app defines. Map them to roles in src/kit/rbac/permissions.ts. */
  permissions: readonly P[];
};

export function defineManifest<const P extends string>(manifest: AppManifest<P>): AppManifest<P> {
  return manifest;
}
