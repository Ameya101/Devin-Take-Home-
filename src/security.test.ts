import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/kit/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => null), requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFound: vi.fn(),
}));

import { securityHeaders } from "../next.config";
import { decisionSchema } from "@/kit/approvals/actions";
import { auditFilterSchema } from "@/kit/audit/queries";
import { sessionOptions } from "@/kit/auth/session";
import { ForbiddenError } from "@/kit/errors";
import { createFlagSchema, directChangeFormSchema, envStateSchema, killSwitchFormSchema, prodChangeFormSchema } from "@/apps/flags/schema";
import { refundFormSchema } from "@/apps/refunds/schema";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sources = walk("src").filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const serverActionFiles = sources.filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")));
const routeFiles = sources.filter((f) => /[\\/]route\.ts$/.test(f));

// Explicit, reviewed exceptions: they run before a user exists or expose no data.
const PUBLIC = new Set(["src/kit/auth/actions.ts#signInAction", "src/kit/auth/actions.ts#signOutAction", "src/app/api/health/route.ts#GET"]);
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const isDenied = (outcome: unknown) =>
  outcome instanceof ForbiddenError ||
  (typeof outcome === "object" && outcome !== null && "ok" in outcome && outcome.ok === false && /forbidden/i.test(String((outcome as { error?: string }).error)));

describe("guardrail: every server action and route handler is wrapped in withPermission", () => {
  it("discovers the server action and route modules", () => {
    expect(serverActionFiles.length).toBeGreaterThanOrEqual(5);
    expect(routeFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of serverActionFiles) {
    it(`server actions in ${file} deny an anonymous caller`, async () => {
      const mod = await import(path.resolve(file));
      const actions = Object.entries(mod).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => Promise<unknown>][];
      expect(actions.length).toBeGreaterThan(0);
      for (const [name, action] of actions) {
        if (PUBLIC.has(`${file}#${name}`)) continue;
        const outcome = await action(null, new FormData()).then((r) => r, (e: unknown) => e);
        expect(isDenied(outcome), `${file}#${name} ran without withPermission`).toBe(true);
      }
    });
  }

  for (const file of routeFiles) {
    it(`route handlers in ${file} return 403 to an anonymous caller`, async () => {
      const mod = await import(path.resolve(file));
      for (const method of HTTP_METHODS.filter((m) => typeof mod[m] === "function")) {
        if (PUBLIC.has(`${file}#${method}`)) continue;
        const res: Response = await mod[method](new Request("http://localhost/guard", { method }));
        expect(res.status, `${file}#${method} ran without withPermission`).toBe(403);
      }
    });
  }
});

describe("input validation rejects unexpected fields", () => {
  const cases: [string, { safeParse: (v: unknown) => { success: boolean } }, Record<string, unknown>][] = [
    ["decisionSchema", decisionSchema, { requestId: "r", decision: "approve" }],
    ["auditFilterSchema", auditFilterSchema, { actor: "a" }],
    ["refundFormSchema", refundFormSchema, { paymentId: "p", amount: "10", reason: "duplicate" }],
    ["createFlagSchema", createFlagSchema, { key: "a.flag", description: "A valid description", ownerTeam: "platform" }],
    ["envStateSchema", envStateSchema, { enabled: true, rolloutPercent: 5 }],
    ["directChangeFormSchema", directChangeFormSchema, { flagId: "f", environment: "dev", enabled: "on", rolloutPercent: "5" }],
    ["prodChangeFormSchema", prodChangeFormSchema, { flagId: "f", enabled: "on", rolloutPercent: "5" }],
    ["killSwitchFormSchema", killSwitchFormSchema, { flagId: "f", reason: "error spike" }],
  ];
  for (const [name, schema, valid] of cases) {
    it(name, () => {
      expect(schema.safeParse(valid).success).toBe(true);
      expect(schema.safeParse({ ...valid, role: "platform_admin" }).success).toBe(false);
    });
  }
});

describe("session cookie and HTTP security headers", () => {
  it("session cookie is httpOnly, sameSite=lax, and secure in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionOptions().cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "y".repeat(44));
    expect(sessionOptions().cookieOptions).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
    vi.unstubAllEnvs();
  });

  it("sends CSP, X-Frame-Options and Referrer-Policy on every route", () => {
    const byKey = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));
    expect(byKey["Content-Security-Policy"]).toMatch(/default-src 'self'/);
    expect(byKey["Content-Security-Policy"]).toMatch(/frame-ancestors 'none'/);
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
  });
});
