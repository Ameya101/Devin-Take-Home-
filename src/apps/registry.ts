import { flagsManifest } from "./flags/manifest";
import { refundsManifest } from "./refunds/manifest";

/** Every app on the kit. Add your app's manifest here to get nav + permission registration. */
export const apps = [refundsManifest, flagsManifest] as const;
