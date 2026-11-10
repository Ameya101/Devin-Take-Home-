import { defineManifest } from "@/kit/manifest";

export const refundsManifest = defineManifest({
  id: "refunds",
  name: "Refunds",
  icon: "receipt",
  basePath: "/refunds",
  navPermission: "refunds.view",
  permissions: ["refunds.view", "refunds.create", "refunds.approve_large"],
});
