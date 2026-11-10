import { AppShell } from "@/kit/ui/app-shell";

export default function KitLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
