import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/kit/auth/current-user";
import { ICONS } from "@/kit/ui/icons";
import { navFor } from "@/kit/ui/nav";
import { PageHeader } from "@/kit/ui/page-header";

export default async function HomePage() {
  const user = await requireUser();
  const nav = navFor(user);
  const items = [...nav.apps, ...nav.kit];
  return (
    <div>
      <PageHeader title={`Welcome, ${user.name}`} description="Tools you have access to with your current role." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => {
          const Icon = ICONS[i.icon];
          return (
            <Link key={i.href} href={i.href}>
              <Card className="transition hover:ring-2 hover:ring-zinc-300">
                <CardHeader>
                  <Icon className="size-5" />
                  <CardTitle>{i.label}</CardTitle>
                  <CardDescription className="font-mono text-xs">{i.permission}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Your role has no tools yet.</p>}
      </div>
    </div>
  );
}
