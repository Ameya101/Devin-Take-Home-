import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)]));

describe("guardrail: every exported function in src/kit is exercised by a test", () => {
  it("each export is referenced from at least one test file", () => {
    const files = walk("src").filter((f) => /\.tsx?$/.test(f));
    const tests = files.filter((f) => /\.test\.tsx?$/.test(f) && !f.endsWith("coverage.test.ts")).map((f) => readFileSync(f, "utf8")).join("\n");
    const untested = files
      .filter((f) => f.startsWith(`src${path.sep}kit`) && !/\.test\.tsx?$/.test(f))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map((m) => `${f}#${m[1]}`))
      .filter((id) => !new RegExp(`\\b${id.split("#")[1]}\\b`).test(tests));
    expect(untested).toEqual([]);
  });
});
