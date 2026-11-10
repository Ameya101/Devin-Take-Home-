/** Stable UTC timestamp for tables: 2026-11-10 13:26 */
export function formatDateTime(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16);
}
