import type { SessionOptions } from "iron-session";

export type SessionData = { userId?: string };

export const SESSION_COOKIE = "itk_session";

/** The value published in .env.example. Anyone can forge cookies with it, so production refuses it. */
export const EXAMPLE_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-0123456789";

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long");
  }
  if (process.env.NODE_ENV === "production" && password === EXAMPLE_SESSION_SECRET) {
    throw new Error("SESSION_SECRET is the public example value; generate one with: openssl rand -base64 32");
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
