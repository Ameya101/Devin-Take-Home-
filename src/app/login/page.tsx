import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signInAction } from "@/kit/auth/actions";
import { getAuthProvider } from "@/kit/auth";
import { assertDevAuthAllowed } from "@/kit/auth/dev-provider";
import { prisma } from "@/kit/db";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const provider = getAuthProvider();
  if (provider.id === "dev") assertDevAuthAllowed();
  // Unauthenticated by design: the dev picker needs the seeded user list before anyone is signed in.
  const users = provider.id === "dev" ? await prisma.user.findMany({ orderBy: { email: "asc" } }) : [];
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          {provider.id === "dev" && (
            <div className="mb-2 w-fit rounded bg-red-600 px-2 py-0.5 text-xs font-bold tracking-wider text-white">DEV ONLY</div>
          )}
          <CardTitle>Sign in to Acme Internal Tools</CardTitle>
          <CardDescription>
            {provider.id === "dev"
              ? "Development login: pick a seeded user. No password. Never enable in production."
              : "Sign in with your company SSO."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {provider.id === "dev" ? (
            users.map((u) => (
              <form key={u.id} action={signInAction}>
                <input type="hidden" name="userId" value={u.id} />
                <button type="submit" className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted">
                  <span>
                    <span className="font-medium">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs">{u.role}</span>
                </button>
              </form>
            ))
          ) : (
            <form action={signInAction}>
              <Button type="submit" className="w-full">Sign in with SSO</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
