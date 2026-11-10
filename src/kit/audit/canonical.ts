export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Normalizes any value (Dates, undefined, class instances) to plain JSON. */
export function toJson(value: unknown): JsonValue {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/** Deterministic JSON: object keys sorted recursively, so the same data always hashes the same. */
export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
