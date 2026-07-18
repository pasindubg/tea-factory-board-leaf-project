"use client";

import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

export type ValuationTableRow = {
  id: string;
  invoiceNo: string;
  lotNo: string;
  grade: string;
  netWt: number;
  priceMin: number;
  priceMax: number;
  projectedProceeds: number;
  expectedProceeds: number;
  proceedsVariance: number;
  proceedsTallies: boolean;
  tastingNote: string;
  matched: boolean;
  currentSaleNo: string;
  outcome: string;
};

const money = (amount: number) => amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COLUMNS: EntityListColumn<ValuationTableRow>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "currentSaleNo", label: "Current sale", accessor: (row) => row.currentSaleNo || null, sortable: true, filter: "text", render: (row) => row.currentSaleNo || "—" },
  { key: "outcome", label: "On confirm", accessor: (row) => row.outcome, sortable: true, filter: "select", cellClassName: "text-xs" },
  { key: "lotNo", label: "Lot", accessor: (row) => row.lotNo, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (row) => row.grade, sortable: true, filter: "select" },
  { key: "netWt", label: "Net kg", accessor: (row) => row.netWt, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.netWt.toFixed(2) },
  { key: "priceMin", label: "Valuation /kg", accessor: (row) => row.priceMin, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.priceMin === row.priceMax ? row.priceMin.toFixed(2) : `${row.priceMin}–${row.priceMax}` },
  { key: "expectedProceeds", label: "Low × net kg", accessor: (row) => row.expectedProceeds, sortable: true, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => money(row.expectedProceeds) },
  { key: "projectedProceeds", label: "Reported proceeds", accessor: (row) => row.projectedProceeds, sortable: true, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => money(row.projectedProceeds) },
  { key: "proceedsVariance", label: "Difference", accessor: (row) => row.proceedsVariance, sortable: true, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => <span className={row.proceedsTallies ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}>{money(row.proceedsVariance)}</span> },
  { key: "proceedsTallies", label: "Tally", accessor: (row) => row.proceedsTallies ? "tallies" : "does not tally", sortable: true, filter: "select", filterOptions: [{ value: "tallies", label: "tallies" }, { value: "does not tally", label: "does not tally" }], render: (row) => <TallyBadge tallies={row.proceedsTallies} /> },
  { key: "tastingNote", label: "Tasting note", accessor: (row) => row.tastingNote, sortable: true, filter: "text", cellClassName: "max-w-xs text-xs text-stone-500 dark:text-stone-400" },
  { key: "matched", label: "Match", accessor: (row) => row.matched ? "lot" : "no lot", sortable: true, filter: "select", filterOptions: [{ value: "lot", label: "lot" }, { value: "no lot", label: "no lot" }], render: (row) => <MatchBadge matched={row.matched} /> },
];

const LIST: ListDefinition<ValuationTableRow> = { columns: COLUMNS, selectionMode: "single" };

export function ValuationTable({ rows }: { rows: ValuationTableRow[] }) {
  return (
    <EntityList
      scope="valuation-lines"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `invoice ${row.invoiceNo}`}
      title="Valuation lines"
      emptyMessage="No valuation rows."
    />
  );
}

function TallyBadge({ tallies }: { tallies: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tallies ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300"}`}>{tallies ? "tallies" : "check"}</span>;
}

function MatchBadge({ matched }: { matched: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${matched ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400"}`}>{matched ? "lot" : "no lot"}</span>;
}
