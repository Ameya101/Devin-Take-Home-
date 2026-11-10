import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionOptions, type SessionData } from "@/kit/auth/session";

/** Redirects requests without a valid session cookie to /login. Authorization happens in withPermission. */
export async function middleware(req: NextRequest) {
  const sealed = req.cookies.get(SESSION_COOKIE)?.value;
  if (sealed) {
    try {
      const { password, ttl } = sessionOptions();
      const data = await unsealData<SessionData>(sealed, { password, ttl });
      if (data.userId) return NextResponse.next();
    } catch {
      // invalid or expired cookie: fall through to redirect
    }
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
