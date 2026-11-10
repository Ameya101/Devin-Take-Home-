import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { prisma } from "@/kit/db";
import { sessionOptions, type SessionData } from "./session";
import type { AuthProvider, SessionUser, SignInInput } from "./types";
import { toSessionUser } from "./user";

/**
 * DEV ONLY. Lets you pick any seeded user on /login with no password.
 * The choice is stored in a signed + encrypted httpOnly cookie (iron-session).
 */
/** The passwordless picker must never serve a production deployment by accident. */
export function assertDevAuthAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_AUTH_IN_PRODUCTION !== "true") {
    throw new Error('AUTH_PROVIDER="dev" is refused in production. Use "oidc" (or set ALLOW_DEV_AUTH_IN_PRODUCTION="true" for a local demo).');
  }
}

export class DevAuthProvider implements AuthProvider {
  readonly id = "dev" as const;

  private async session() {
    const cookieStore = await cookies();
    assertDevAuthAllowed();
    return getIronSession<SessionData>(cookieStore, sessionOptions());
  }

  async getCurrentUser(): Promise<SessionUser | null> {
    const session = await this.session();
    if (!session.userId) return null;
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    return user ? toSessionUser(user) : null;
  }

  async signIn({ userId }: SignInInput): Promise<void> {
    if (!userId) throw new Error("userId is required");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Unknown user");
    const session = await this.session();
    session.userId = user.id;
    await session.save();
  }

  async signOut(): Promise<void> {
    const session = await this.session();
    session.destroy();
  }
}
