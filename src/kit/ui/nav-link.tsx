"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICONS, type IconName } from "./icons";
import { cn } from "@/lib/utils";

export function NavLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = ICONS[icon];
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white",
        active && "bg-zinc-800 text-white",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
