import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLE_SESSION_SECRET, sessionOptions } from "./session";

describe("session secret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses the public example secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
    expect(() => sessionOptions()).toThrow(/public example value/);
    vi.stubEnv("SESSION_SECRET", "x".repeat(44));
    expect(sessionOptions().password).toBe("x".repeat(44));
  });

  it("rejects short secrets", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => sessionOptions()).toThrow(/at least 32/);
  });
});
