import { cn } from "@/lib/utils";

type Obj = Record<string, unknown>;

function asObject(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function show(v: unknown): string {
  if (v === undefined) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Field-by-field before/after table; changed fields are highlighted. */
export function DiffView({ before, after, metadata }: { before: unknown; after: unknown; metadata: unknown }) {
  const b = asObject(before) ?? (before == null ? {} : { value: before });
  const a = asObject(after) ?? (after == null ? {} : { value: after });
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return (
    <div className="space-y-3 text-xs">
      {keys.length > 0 ? (
        <table className="w-full table-fixed border-collapse font-mono">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="w-48 py-1">field</th>
              <th className="py-1">before</th>
              <th className="py-1">after</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const changed = show(b[k]) !== show(a[k]);
              return (
                <tr key={k} className={cn("border-t align-top", changed && "bg-amber-50")}>
                  <td className="py-1 pr-2">{k}</td>
                  <td className={cn("break-all py-1 pr-2", changed && "text-red-700")}>{show(b[k])}</td>
                  <td className={cn("break-all py-1", changed && "text-emerald-700")}>{show(a[k])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-muted-foreground">No before/after values.</p>
      )}
      {metadata != null && (
        <div>
          <span className="text-muted-foreground">metadata: </span>
          <code className="break-all">{JSON.stringify(metadata)}</code>
        </div>
      )}
    </div>
  );
}
