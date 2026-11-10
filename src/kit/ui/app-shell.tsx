import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/kit/auth/actions";
import { requireUser } from "@/kit/auth/current-user";
import { NavLink } from "./nav-link";
import { navFor } from "./nav";

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const nav = navFor(user);
  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="flex w-56 shrink-0 flex-col bg-zinc-900 p-3">
        <div className="px-3 py-3 text-sm font-semibold tracking-tight text-white">Acme Internal Tools</div>
        <nav className="mt-2 space-y-1">
          <NavLink href="/" label="Home" icon="home" />
          {nav.apps.length > 0 && <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-zinc-500">Apps</div>}
          {nav.apps.map((i) => (
            <NavLink key={i.href} href={i.href} label={i.label} icon={i.icon} />
          ))}
          {nav.kit.length > 0 && <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider text-zinc-500">Governance</div>}
          {nav.kit.map((i) => (
            <NavLink key={i.href} href={i.href} label={i.label} icon={i.icon} />
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-4 border-b bg-background px-6">
          <div className="text-right text-sm leading-tight">
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">
              {user.email} · <span className="font-mono">{user.role}</span>
            </div>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
