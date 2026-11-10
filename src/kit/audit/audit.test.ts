import { describe, expect, it } from "vitest";
import { prisma } from "@/kit/db";
import { audit, GENESIS_HASH } from "./audit";
import { canonicalJson } from "./canonical";

const actor = { id: "u1", email: "u1@test.local" };

describe("audit hash chain", () => {
  it("canonical JSON is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("links each event to the previous hash", async () => {
    const first = await prisma.$transaction((tx) => audit.record(tx, { actor, action: "test.a", entityType: "T", entityId: "1", after: { x: 1 } }));
    const second = await prisma.$transaction((tx) => audit.record(tx, { actor, action: "test.b", entityType: "T", entityId: "1", before: { x: 1 }, after: { x: 2 } }));
    expect(second.prevHash).toBe(first.hash);
    const genesis = await prisma.auditEvent.findFirstOrThrow({ orderBy: { id: "asc" } });
    expect(genesis.prevHash).toBe(GENESIS_HASH);
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });

  it("a recorded head detects events deleted from the end of the chain", async () => {
    await prisma.$transaction((tx) => audit.record(tx, { actor, action: "test.tail", entityType: "T", entityId: "a" }));
    const last = await prisma.$transaction((tx) => audit.record(tx, { actor, action: "test.tail", entityType: "T", entityId: "b" }));
    const verified = await audit.verifyChain();
    expect(verified).toMatchObject({ ok: true, head: { id: last.id, hash: last.hash } });
    const head = { id: last.id, hash: last.hash };
    expect(await audit.verifyChain(prisma, head)).toMatchObject({ ok: true });

    await prisma.auditEvent.delete({ where: { id: last.id } });
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
    expect(await audit.verifyChain(prisma, head)).toMatchObject({ ok: false, brokenAt: { id: last.id, reason: "anchor_mismatch" } });
  });

  it("concurrent writers never fork the chain", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        prisma.$transaction(async (tx) => {
          const event = await audit.record(tx, { actor, action: "test.concurrent", entityType: "T", entityId: String(i) });
          await new Promise((r) => setTimeout(r, 20));
          return event;
        }),
      ),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });

  it("rolls back with the caller's transaction", async () => {
    const before = await prisma.auditEvent.count();
    await prisma
      .$transaction(async (tx) => {
        await audit.record(tx, { actor, action: "test.rollback", entityType: "T", entityId: "2" });
        throw new Error("boom");
      })
      .catch(() => undefined);
    expect(await prisma.auditEvent.count()).toBe(before);
  });

  it("verifyChain reports the first tampered row", async () => {
    const target = await prisma.$transaction((tx) => audit.record(tx, { actor, action: "refund.processed", entityType: "Refund", entityId: "r1", after: { amountCents: 5000 } }));
    await prisma.$transaction((tx) => audit.record(tx, { actor, action: "test.after", entityType: "T", entityId: "3" }));
    try {
      // Simulate someone editing the database directly.
      await prisma.auditEvent.update({ where: { id: target.id }, data: { after: { amountCents: 1 } } });
      expect(await audit.verifyChain()).toMatchObject({ ok: false, brokenAt: { id: target.id, reason: "hash_mismatch" } });
    } finally {
      await prisma.auditEvent.update({ where: { id: target.id }, data: { after: { amountCents: 5000 } } });
    }
    expect(await audit.verifyChain()).toMatchObject({ ok: true });
  });
});
