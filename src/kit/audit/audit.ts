import { createHash } from "node:crypto";
import { Prisma, type AuditEvent } from "@prisma/client";
import { prisma, type Tx } from "@/kit/db";
import { canonicalJson, toJson, type JsonValue } from "./canonical";

export const GENESIS_HASH = "0".repeat(64);

export type AuditActor = { id: string; email: string } | null;

export type AuditInput = {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

/** Exactly the fields covered by the hash. */
export type HashedFields = {
  timestamp: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: JsonValue;
  after: JsonValue;
  metadata: JsonValue;
};

export function computeHash(prevHash: string, fields: HashedFields): string {
  return createHash("sha256")
    .update(prevHash + canonicalJson(fields as unknown as JsonValue))
    .digest("hex");
}

function dbJson(value: JsonValue) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/**
 * Appends an event to the hash chain. Must be called with the caller's transaction
 * so the audit row commits (or rolls back) together with the change it describes.
 */
async function record(tx: Tx, input: AuditInput): Promise<AuditEvent> {
  const last = await tx.auditEvent.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const fields: HashedFields = {
    timestamp: new Date().toISOString(),
    actorId: input.actor?.id ?? null,
    actorEmail: input.actor?.email ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: toJson(input.before),
    after: toJson(input.after),
    metadata: toJson(input.metadata),
  };
  return tx.auditEvent.create({
    data: {
      ...fields,
      timestamp: new Date(fields.timestamp),
      before: dbJson(fields.before),
      after: dbJson(fields.after),
      metadata: dbJson(fields.metadata),
      prevHash,
      hash: computeHash(prevHash, fields),
    },
  });
}

export function hashedFieldsOf(row: AuditEvent): HashedFields {
  return {
    timestamp: row.timestamp.toISOString(),
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: (row.before ?? null) as JsonValue,
    after: (row.after ?? null) as JsonValue,
    metadata: (row.metadata ?? null) as JsonValue,
  };
}

/** Last event of the chain. Record it outside the database (e.g. WORM storage) to detect deleted tail events later. */
export type ChainHead = { id: number; hash: string };

export type ChainVerification =
  | { ok: true; checked: number; head: ChainHead | null }
  | { ok: false; checked: number; brokenAt: { id: number; reason: "prev_hash_mismatch" | "hash_mismatch" | "anchor_mismatch" } };

/** Pure check over rows in id order, continuing from `prevHash`. */
export function verifyRows(rows: AuditEvent[], prevHash = GENESIS_HASH, checkedSoFar = 0) {
  let expectedPrev = prevHash;
  let checked = checkedSoFar;
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return { result: { ok: false, checked, brokenAt: { id: row.id, reason: "prev_hash_mismatch" } } as const, prevHash: expectedPrev };
    }
    if (computeHash(row.prevHash, hashedFieldsOf(row)) !== row.hash) {
      return { result: { ok: false, checked, brokenAt: { id: row.id, reason: "hash_mismatch" } } as const, prevHash: expectedPrev };
    }
    expectedPrev = row.hash;
    checked++;
  }
  return { result: { ok: true, checked } as const, prevHash: expectedPrev };
}

/**
 * Recomputes the whole chain in batches and reports the first broken row, if any.
 * Links alone cannot reveal deleted events at the end of the chain, so pass a previously recorded
 * `anchor` (an earlier ChainHead) to also check that event is still present and unchanged.
 */
async function verifyChain(db: Pick<typeof prisma, "auditEvent"> = prisma, anchor?: ChainHead): Promise<ChainVerification> {
  const batchSize = 1000;
  let prevHash = GENESIS_HASH;
  let checked = 0;
  let cursor = 0;
  let head: ChainHead | null = null;
  let anchorFound = !anchor;
  for (;;) {
    const rows = await db.auditEvent.findMany({ where: { id: { gt: cursor } }, orderBy: { id: "asc" }, take: batchSize });
    if (rows.length === 0) {
      if (!anchorFound && anchor) return { ok: false, checked, brokenAt: { id: anchor.id, reason: "anchor_mismatch" } };
      return { ok: true, checked, head };
    }
    const step = verifyRows(rows, prevHash, checked);
    if (!step.result.ok) return step.result;
    if (anchor && !anchorFound) {
      const row = rows.find((r) => r.id === anchor.id);
      if (row && row.hash !== anchor.hash) return { ok: false, checked, brokenAt: { id: anchor.id, reason: "anchor_mismatch" } };
      anchorFound = Boolean(row);
    }
    prevHash = step.prevHash;
    checked = step.result.checked;
    const last = rows[rows.length - 1];
    head = { id: last.id, hash: last.hash };
    cursor = last.id;
  }
}

export const audit = { record, verifyChain };
