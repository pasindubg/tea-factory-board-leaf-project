"use client";

import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { lkr } from "@/lib/money";

export type StatementLineRow = {
  id: string;
  lineType: string;
  label: string | null;
  quantity: string | null;
  rate: string | null;
  amount: string;
  sortOrder: number;
};

const COLUMNS: ColumnDef<StatementLineRow>[] = [
  { key: "label", label: "Description", accessor: (row) => row.label ?? row.lineType, sortable: true },
  { key: "quantity", label: "Kg", accessor: (row) => row.quantity == null ? null : Number(row.quantity), sortable: true },
  { key: "rate", label: "Rate", accessor: (row) => row.rate == null ? null : Number(row.rate), sortable: true },
  { key: "amount", label: "Amount", accessor: (row) => Number(row.amount), sortable: true },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "single",
  add: false,
  edit: false,
  delete: false,
} satisfies ListDefinition<StatementLineRow>;

export function StatementLinesList({ rows }: { rows: StatementLineRow[] }) {
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: LIST.selectionMode, getId: (row) => row.id });

  return (
    <ListSurface
      title="Statement lines"
      description="Read-only calculation detail for this generated statement."
      className="shadow-none"
    >
      <ListCommandToolbar mode={LIST.selectionMode} count={selection.selectedCount} />
      <ListSearchPanel columns={LIST.columns} controls={controls} label="Search statement lines" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {LIST.columns.map((column) => (
                <th key={column.key} className={column.key === "label" ? "px-4 py-2" : "px-4 py-2 text-right"}>
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((line) => {
              const amount = Number(line.amount);
              return (
                <tr key={line.id} {...selection.rowProps(line.id)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(line.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
                  <td className="px-4 py-2">{line.label ?? line.lineType}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-stone-500 dark:text-stone-400">{line.quantity ? Number(line.quantity).toFixed(2) : ""}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-stone-500 dark:text-stone-400">{line.rate ? Number(line.rate).toFixed(2) : ""}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${amount < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{lkr(amount)}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">{rows.length === 0 ? "No calculation lines were generated." : "No statement lines match these filters."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}
