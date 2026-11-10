import { PageHeader } from "@/kit/ui/page-header";

export default function ForbiddenPage() {
  return <PageHeader title="403: Access denied" description="Your role does not grant access to that page. The attempt was recorded in the audit log." />;
}
