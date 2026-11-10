import type { AuditEvent } from "@prisma/client";

const COLUMNS = [
  "id", "timestamp", "actorId", "actorEmail", "action", "entityType", "entityId",
  "before", "after", "metadata", "prevHash", "hash",
] as const;

function cell(value: unknown): string {
  let s = value == null ? "" : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function auditEventsToCsv(rows: AuditEvent[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) lines.push(COLUMNS.map((c) => cell(row[c])).join(","));
  return lines.join("\n") + "\n";
}
