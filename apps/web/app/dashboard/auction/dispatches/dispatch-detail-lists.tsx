"use client";

import Link from "next/link";
import { ListCommandToolbar, ListSearchPanel, ListSurface, SortButton, TabbedListSurface, useListControls, useListSelection, type ColumnDef, type ListDefinition } from "@/components/list-controls";

export type DispatchLotRow = {
  id: string;
  brokerInvoiceNo: string;
  lotNo: string;
  grade: string;
  bags: number | null;
  netWt: string | number | null;
  state: string;
};

export type DispatchInvoiceRow = {
  id: string;
  invoiceNo: string;
  broker: string;
  invoiceDate: string | null;
  lotsCount: number;
  status: string;
};

const LOT_COLUMNS: ColumnDef<DispatchLotRow>[] = [
  { key: "brokerInvoiceNo", label: "Invoice", accessor: (row) => row.brokerInvoiceNo, sortable: true, filter: "text", lov: false },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.lotNo, sortable: true, filter: "text", lov: false },
  { key: "grade", label: "Grade", accessor: (row) => row.grade, sortable: true, filter: "select" },
  { key: "bags", label: "Bags", accessor: (row) => row.bags, sortable: true, lov: false, searchInput: "number" },
  { key: "netWt", label: "Net kg", accessor: (row) => row.netWt, sortable: true, lov: false, searchInput: "number" },
  { key: "state", label: "State", accessor: (row) => row.state, sortable: true, filter: "select" },
];

const INVOICE_COLUMNS: ColumnDef<DispatchInvoiceRow>[] = [
  { key: "invoiceNo", label: "Invoice no.", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", lov: false },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "invoiceDate", label: "Invoice date", accessor: (row) => row.invoiceDate, sortable: true, lov: false, searchInput: "date" },
  { key: "lotsCount", label: "Lots", accessor: (row) => row.lotsCount, sortable: true, lov: false, searchInput: "number" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

const LOT_LIST: ListDefinition<DispatchLotRow> = { columns: LOT_COLUMNS, selectionMode: "single", add: false, edit: false, delete: false };
const INVOICE_LIST: ListDefinition<DispatchInvoiceRow> = { columns: INVOICE_COLUMNS, selectionMode: "single", add: false, edit: false, delete: false };

function DetailListTable<T extends { id: string }>({
  list,
  rows,
  emptyMessage,
  renderRow,
}: {
  list: ListDefinition<T>;
  rows: T[];
  emptyMessage: string;
  renderRow: (row: T) => React.ReactNode;
}) {
  const controls = useListControls(rows, list.columns);
  const selection = useListSelection(rows, { mode: list.selectionMode ?? "single", getId: (row) => row.id });
  const visibleRows = controls.rows;
  const numericColumns = new Set(["bags", "netWt", "lotsCount"]);

  return (
    <ListSurface>
      <ListCommandToolbar mode={list.selectionMode ?? "single"} count={selection.selectedCount} />
      <ListSearchPanel columns={list.columns} controls={controls} label="Find records" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
            {list.columns.map((column) => <th key={column.key} className={`px-4 py-3 ${numericColumns.has(column.key) ? "text-right" : ""}`}>{column.sortable ? <SortButton col={column} controls={controls} /> : column.label}</th>)}
          </tr></thead>
          <tbody>
            {visibleRows.map((row) => renderRowWithSelection(row, selection, renderRow))}
            {visibleRows.length === 0 && rows.length > 0 && <tr><td colSpan={list.columns.length} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">No records match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">{emptyMessage}</p>}
    </ListSurface>
  );
}

function renderRowWithSelection<T extends { id: string }>(row: T, selection: ReturnType<typeof useListSelection<T>>, renderRow: (row: T) => React.ReactNode) {
  return (
    <tr key={row.id} {...selection.rowProps(row.id)} className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(row.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}>
      {renderRow(row)}
    </tr>
  );
}

export function DispatchDetailLists({ lots, invoices }: { lots: DispatchLotRow[]; invoices: DispatchInvoiceRow[] }) {
  return (
    <TabbedListSurface tabs={[{ id: "lots", label: "Invoice lots", count: `${lots.length} lots` }, { id: "invoices", label: "Broker Invoices", count: `${invoices.length} invoices` }]}>
      <DetailListTable
        list={LOT_LIST}
        rows={lots}
        emptyMessage="No invoice lots in this dispatch."
        renderRow={(lot) => <>
          <td className="px-4 py-3 font-mono font-medium">{lot.brokerInvoiceNo}</td><td className="px-4 py-3">{lot.lotNo}</td><td className="px-4 py-3">{lot.grade}</td><td className="px-4 py-3 text-right tabular-nums">{lot.bags ?? "—"}</td><td className="px-4 py-3 text-right tabular-nums">{lot.netWt == null ? "—" : Number(lot.netWt).toFixed(2)}</td><td className="px-4 py-3">{lot.state}</td>
        </>}
      />
      <DetailListTable
        list={INVOICE_LIST}
        rows={invoices}
        emptyMessage="No Broker Invoices in this dispatch."
        renderRow={(invoice) => <>
          <td className="px-4 py-3 font-mono font-semibold"><Link href={`/dashboard/auction/${invoice.id}`} className="text-green-700 hover:underline dark:text-green-400">{invoice.invoiceNo}</Link></td><td className="px-4 py-3">{invoice.broker}</td><td className="px-4 py-3 tabular-nums">{invoice.invoiceDate ?? "—"}</td><td className="px-4 py-3 text-right tabular-nums">{invoice.lotsCount}</td><td className="px-4 py-3">{invoice.status}</td>
        </>}
      />
    </TabbedListSurface>
  );
}
