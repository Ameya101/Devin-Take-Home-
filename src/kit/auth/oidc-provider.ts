import type { AuthProvider, SessionUser } from "./types";

/**
 * OIDC provider for Entra ID (Azure AD) or Okta. STUB: not implemented yet.
 *
 * Config (see .env.example):
 *   OIDC_ISSUER        Entra ID: https://login.microsoftonline.com/<tenant-id>/v2.0
 *                      Okta:     https://<your-org>.okta.com/oauth2/default
 *   OIDC_CLIENT_ID     App registration (Entra) / application (Okta) client id
 *   OIDC_CLIENT_SECRET Client secret (keep in your secret manager, never in git)
 *   OIDC_REDIRECT_URI  e.g. https://tools.acme.com/api/auth/callback
 */
export class OidcAuthProvider implements AuthProvider {
  readonly id = "oidc" as const;

  async getCurrentUser(): Promise<SessionUser | null> {
    // TODO: read the iron-session cookie set by the callback route and load the User row.
    // TODO: map the IdP group/app-role claim (Entra "roles", Okta "groups") to a kit Role.
    return null;
  }

  async signIn(): Promise<void> {
    // TODO: redirect to `${OIDC_ISSUER}/authorize` (authorization code + PKCE),
    // then handle /api/auth/callback: exchange code, validate id_token, upsert User, save session.
    throw new Error("OIDC sign-in is not implemented yet (AUTH_PROVIDER=oidc is a stub)");
  }

  async signOut(): Promise<void> {
    // TODO: destroy the session cookie and redirect to the IdP end_session_endpoint.
    throw new Error("OIDC sign-out is not implemented yet");
  }
}
