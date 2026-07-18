"use client";

import type { ValClass } from "@tea/api";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

const CLASS_STYLE: Record<ValClass, string> = {
  above: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400",
  within: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-400",
  below: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-400",
  "no-valuation": "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400",
};

const CLASS_OPTIONS: ValClass[] = ["above", "within", "below", "no-valuation"];

export type ContractLineRow = {
  sold: boolean;
  status: "Sold" | "Not sold" | "Re-print";
  invoiceNo: string;
  invoiceMatched: boolean;
  buyerName: string;
  netWt: number;
  pricePerKg: number;
  priceMin: number | null;
  priceMax: number | null;
  classification: ValClass;
  proceeds: number;
  expectedProceeds: number;
  proceedsVariance: number;
  proceedsMatch: boolean;
  variance: number | null;
  vatAmount: number;
  onGuarantee: boolean;
};

const COLUMNS: EntityListColumn<ContractLineRow>[] = [
  {
    key: "status",
    label: "Status",
    accessor: (row) => row.status,
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "Sold", label: "Sold" }, { value: "Not sold", label: "Not sold" }, { value: "Re-print", label: "Re-print" }],
    render: (row) => <StatusBadge status={row.status} />,
  },
  { key: "invoiceNo", label: "Invoice", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  {
    key: "invoiceMatch",
    label: "Invoice match",
    accessor: (row) => row.invoiceMatched ? "Matched" : "Missing",
    filter: "select",
    filterOptions: [{ value: "Matched", label: "Matched" }, { value: "Missing", label: "Missing" }],
    render: (row) => (
      <span className={`rounded-full px-2 py-0.5 text-xs ${row.invoiceMatched ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"}`}>
        {row.invoiceMatched ? "Matched" : "Missing"}
      </span>
    ),
  },
  { key: "buyerName", label: "Buyer", accessor: (row) => row.buyerName, sortable: true, filter: "select", cellClassName: "text-xs" },
  { key: "netWt", label: "Nett kg", accessor: (row) => row.netWt, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.netWt.toLocaleString(undefined, { minimumFractionDigits: 2 }) },
  { key: "pricePerKg", label: "Price/kg", accessor: (row) => row.pricePerKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.pricePerKg.toLocaleString() },
  { key: "priceMin", label: "Valuation /kg", accessor: (row) => row.priceMin ?? null, sortable: true, render: (row) => row.priceMin == null ? "—" : row.priceMin === row.priceMax ? row.priceMin.toFixed(0) : `${row.priceMin}–${row.priceMax}` },
  { key: "classification", label: "vs range", accessor: (row) => row.classification, sortable: true, filter: "select", filterOptions: CLASS_OPTIONS.map((classification) => ({ value: classification, label: classification })), render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${CLASS_STYLE[row.classification]}`}>{row.classification}</span> },
  { key: "proceeds", label: "Proceeds", accessor: (row) => row.proceeds, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.proceeds.toLocaleString() },
  {
    key: "proceedsCheck",
    label: "Proceeds check",
    accessor: (row) => row.sold ? row.proceedsMatch ? "Matches" : "Mismatch" : "Not sold",
    filter: "select",
    filterOptions: [{ value: "Matches", label: "Matches" }, { value: "Mismatch", label: "Mismatch" }, { value: "Not sold", label: "Not sold" }],
    render: (row) => <ProceedsCheck row={row} />,
  },
  { key: "variance", label: "Δ vs projected", accessor: (row) => row.variance ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right", render: (row) => row.variance == null ? "—" : `${row.variance > 0 ? "+" : ""}${row.variance.toLocaleString()}` },
  { key: "vatAmount", label: "VAT", accessor: (row) => row.vatAmount, sortable: true, cellClassName: "text-xs", render: (row) => <>{row.vatAmount.toLocaleString()}{row.onGuarantee && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-900 dark:text-amber-400">guar.</span>}</> },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<ContractLineRow>;

export function ContractLinesTable({ rows }: { rows: ContractLineRow[] }) {
  return (
    <EntityList
      scope="contract-lines"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.invoiceNo}
      rowLabel={(row) => `invoice ${row.invoiceNo}`}
      title="Contract lines"
      description="Staged buyer, price, proceeds and VAT values before confirmation."
      emptyMessage="No contract lines."
      rowClassName={(row) => !row.invoiceMatched || (row.sold && !row.proceedsMatch) ? "bg-red-50/80 ring-1 ring-inset ring-red-300 dark:bg-red-950/30 dark:ring-red-800" : ""}
    />
  );
}

function ProceedsCheck({ row }: { row: ContractLineRow }) {
  if (!row.sold) return <span className="text-xs text-stone-500 dark:text-stone-400">Not sold</span>;
  if (row.proceedsMatch) {
    return (
      <span
        className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-300"
        title={`${row.netWt.toFixed(2)} kg × ${row.pricePerKg.toFixed(2)} = ${row.expectedProceeds.toFixed(2)}`}
      >
        Matches
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-red-700 dark:text-red-300">
      Expected {row.expectedProceeds.toLocaleString()} ({row.proceedsVariance > 0 ? "+" : ""}{row.proceedsVariance.toLocaleString()})
    </span>
  );
}

function StatusBadge({ status }: { status: ContractLineRow["status"] }) {
  const style = status === "Sold"
    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400"
    : status === "Re-print"
      ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
      : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${style}`}>{status}</span>;
}
