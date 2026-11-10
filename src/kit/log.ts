import { headers } from "next/headers";

/** Set by src/middleware.ts on every request and echoed in the response. */
export const REQUEST_ID_HEADER = "x-request-id";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

async function currentRequestId(): Promise<string | undefined> {
  try {
    return (await headers()).get(REQUEST_ID_HEADER) ?? undefined;
  } catch {
    return undefined; // outside a request (seed, tests, scripts)
  }
}

/** One JSON object per line on stdout/stderr, ready for any log shipper. Never pass secrets or full PII. */
export async function log(level: Level, msg: string, fields: Fields = {}): Promise<void> {
  if (process.env.NODE_ENV === "test" && process.env.LOG_IN_TESTS !== "true") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, requestId: await currentRequestId(), ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, fields?: Fields) => log("info", msg, fields),
  warn: (msg: string, fields?: Fields) => log("warn", msg, fields),
  error: (msg: string, fields?: Fields) => log("error", msg, fields),
};
