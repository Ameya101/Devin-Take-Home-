import type { SessionOptions } from "iron-session";

export type SessionData = { userId?: string };

export const SESSION_COOKIE = "itk_session";

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  return {
    password,
    cookieName: SESSION_COOKIE,
    ttl: 60 * 60 * 8,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}
