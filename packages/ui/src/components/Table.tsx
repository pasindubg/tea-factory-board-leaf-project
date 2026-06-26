import * as React from "react";

export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface TableProps<T = Record<string, unknown>> {
  columns: TableColumn<T>[];
  rows: T[];
  keyField?: string;
  emptyMessage?: string;
  className?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  keyField = "id",
  emptyMessage = "No records found.",
  className = "",
}: TableProps<T>) {
  return (
    <div className={["overflow-x-auto rounded-xl border border-stone-200 bg-white", className].filter(Boolean).join(" ")}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500",
                  col.headerClassName ?? "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-stone-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={String(row[keyField] ?? i)}
                className="border-b border-stone-100 last:border-0 hover:bg-stone-50"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      "px-4 py-3 text-stone-700",
                      col.className ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
