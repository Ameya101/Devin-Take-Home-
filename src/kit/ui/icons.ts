import { CheckSquare, Flag, Home, ReceiptText, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";

/** Icons available to app manifests (manifest.icon is one of these keys). */
export const ICONS = {
  home: Home,
  receipt: ReceiptText,
  flag: Flag,
  shield: ShieldCheck,
  approvals: CheckSquare,
  audit: ScrollText,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
