import { unsealData } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionOptions, type SessionData } from "@/kit/auth/session";

const REQUEST_ID_HEADER = "x-request-id";
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];

const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

async function hasSession(req: NextRequest): Promise<boolean> {
  const sealed = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sealed) return false;
  try {
    const { password, ttl } = sessionOptions();
    const data = await unsealData<SessionData>(sealed, { password, ttl });
    return Boolean(data.userId);
  } catch {
    return false; // invalid or expired cookie
  }
}

/**
 * Tags every request with a request id (kept if the caller sent a sane one) for the JSON logs, and
 * redirects requests without a valid session cookie to /login. Authorization happens in withPermission.
 */
export async function middleware(req: NextRequest) {
  const incoming = req.headers.get(REQUEST_ID_HEADER);
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  const path = req.nextUrl.pathname;

  let res: NextResponse;
  if (isPublic(path) || (await hasSession(req))) {
    const headers = new Headers(req.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    res = NextResponse.next({ request: { headers } });
  } else {
    res = NextResponse.redirect(new URL("/login", req.url));
  }
  res.headers.set(REQUEST_ID_HEADER, requestId);
  if (process.env.NODE_ENV !== "test") {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "request", requestId, method: req.method, path, status: res.status }));
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
