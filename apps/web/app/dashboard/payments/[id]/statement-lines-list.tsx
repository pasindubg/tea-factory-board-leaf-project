"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
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

const COLUMNS: EntityListColumn<StatementLineRow>[] = [
  { key: "label", label: "Description", accessor: (row) => row.label ?? row.lineType, sortable: true },
  { key: "quantity", label: "Kg", accessor: (row) => row.quantity == null ? null : Number(row.quantity), sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums text-stone-500 dark:text-stone-400", render: (row) => row.quantity ? Number(row.quantity).toFixed(2) : "" },
  { key: "rate", label: "Rate", accessor: (row) => row.rate == null ? null : Number(row.rate), sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums text-stone-500 dark:text-stone-400", render: (row) => row.rate ? Number(row.rate).toFixed(2) : "" },
  { key: "amount", label: "Amount", accessor: (row) => Number(row.amount), sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => <span className={Number(row.amount) < 0 ? "text-red-700 dark:text-red-400" : ""}>{lkr(row.amount)}</span> },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<StatementLineRow>;

export function StatementLinesList({ rows }: { rows: StatementLineRow[] }) {
  return (
    <EntityList
      scope="payment-statement-lines"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.label ?? row.lineType}
      title="Statement lines"
      description="Read-only calculation detail for this generated statement."
      emptyMessage="No calculation lines were generated."
      filteredEmptyMessage="No statement lines match these filters."
      className="shadow-none"
    />
  );
}
