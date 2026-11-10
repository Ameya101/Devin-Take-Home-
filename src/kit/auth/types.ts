import type { Role } from "@/kit/rbac/permissions";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type SignInInput = { userId?: string };

/** The only contract the rest of the kit relies on. Swap implementations via AUTH_PROVIDER. */
export interface AuthProvider {
  readonly id: "dev" | "oidc";
  getCurrentUser(): Promise<SessionUser | null>;
  signIn(input: SignInInput): Promise<void>;
  signOut(): Promise<void>;
}
