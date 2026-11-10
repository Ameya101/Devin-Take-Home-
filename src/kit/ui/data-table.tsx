"use client";

import { ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn = { key: string; header: string; sortable?: boolean; className?: string };

export type DataTableRow = {
  id: string;
  /** Pre-rendered cells keyed by column key. Mask PII on the server before it gets here. */
  cells: Record<string, ReactNode>;
  /** Raw values used for sorting, keyed by column key. */
  sortValues?: Record<string, string | number>;
  /** Text matched by the quick filter. */
  searchText?: string;
  /** Navigates here when the row is clicked. */
  href?: string;
  /** Expandable detail rendered under the row. */
  detail?: ReactNode;
};

type Sort = { key: string; dir: "asc" | "desc" } | null;

export function DataTable({
  columns,
  rows,
  pageSize = 15,
  filterPlaceholder = "Filter rows…",
  emptyMessage = "No results.",
}: {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  pageSize?: number;
  filterPlaceholder?: string;
  emptyMessage?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expandable = rows.some((r) => r.detail);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => (r.searchText ?? "").toLowerCase().includes(q)) : rows;
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a.sortValues?.[sort.key] ?? "";
      const bv = b.sortValues?.[sort.key] ?? "";
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }, [rows, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(key: string) {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <Input
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setPage(0);
        }}
        placeholder={filterPlaceholder}
        className="max-w-xs"
      />
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              {expandable && <TableHead className="w-8" />}
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.sortable ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.header}
                      <ArrowUpDown className="size-3 opacity-60" />
                      {sort?.key === c.key && <span className="text-[10px]">{sort.dir}</span>}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + (expandable ? 1 : 0)} className="py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  className={cn(row.href && "cursor-pointer")}
                  onClick={row.href ? () => router.push(row.href!) : row.detail ? () => toggleExpanded(row.id) : undefined}
                >
                  {expandable && (
                    <TableCell className="w-8">
                      {row.detail && (expanded.has(row.id) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />)}
                    </TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {row.cells[c.key]}
                    </TableCell>
                  ))}
                </TableRow>
                {row.detail && expanded.has(row.id) && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={columns.length + 1} className="whitespace-normal">
                      {row.detail}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {visible.length} row{visible.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <span>
            Page {current + 1} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
