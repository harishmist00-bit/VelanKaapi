import { ReactNode } from "react";

import { EmptyState, ErrorState } from "./ErrorState";
import { LoadingSpinner } from "./LoadingSpinner";
import { Pagination } from "./Pagination";

export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; className?: string }
interface Props<T> {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (row: T) => string | number; loading?: boolean; error?: string | null; onRetry?: () => void;
  emptyTitle?: string; emptyHint?: string; onRowClick?: (row: T) => void;
  page?: number; pageSize?: number; count?: number; onPage?: (p: number) => void;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, emptyTitle = "Nothing here yet", emptyHint, onRowClick, page, pageSize, count, onPage }: Props<T>) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !rows?.length) return <LoadingSpinner />;
  if (!rows?.length) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-slate-200 bg-slate-50"><tr>{columns.map((c) => <th key={c.key} className={`th ${c.className ?? ""}`}>{c.header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={rowKey(row)} className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""} onClick={() => onRowClick?.(row)}>
                {columns.map((c) => <td key={c.key} className={`td ${c.className ?? ""}`}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && pageSize && count !== undefined && onPage && <Pagination page={page} pageSize={pageSize} count={count} onPage={onPage} />}
    </div>
  );
}
