import { DevAuthProvider } from "./dev-provider";
import { OidcAuthProvider } from "./oidc-provider";
import type { AuthProvider } from "./types";

export type { AuthProvider, SessionUser } from "./types";

export function getAuthProvider(): AuthProvider {
  const kind = process.env.AUTH_PROVIDER ?? "dev";
  switch (kind) {
    case "dev":
      return new DevAuthProvider();
    case "oidc":
      return new OidcAuthProvider();
    default:
      throw new Error(`Unknown AUTH_PROVIDER "${kind}" (expected "dev" or "oidc")`);
  }
}
