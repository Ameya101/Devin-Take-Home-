import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CreateFlagForm } from "@/apps/flags/components/create-flag-form";
import { getCreateFlagOptions } from "@/apps/flags/queries";
import { orForbidden } from "@/kit/rbac/page";
import { PageHeader } from "@/kit/ui/page-header";

export default async function NewFlagPage() {
  const { ownerTeams } = await orForbidden(getCreateFlagOptions());
  return (
    <div>
      <Link href="/flags" className="text-sm text-muted-foreground hover:underline">← All flags</Link>
      <PageHeader title="New feature flag" />
      <Card>
        <CardContent>
          <CreateFlagForm ownerTeams={ownerTeams} />
        </CardContent>
      </Card>
    </div>
  );
}
