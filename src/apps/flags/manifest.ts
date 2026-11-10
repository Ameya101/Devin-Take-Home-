import { defineManifest } from "@/kit/manifest";

export const flagsManifest = defineManifest({
  id: "flags",
  name: "Feature flags",
  icon: "flag",
  basePath: "/flags",
  navPermission: "flags.view",
  permissions: ["flags.view", "flags.create", "flags.edit_nonprod", "flags.request_prod", "flags.approve_prod"],
});
