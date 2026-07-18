"use client";

import Link from "next/link";
import { EntityList, EntityListTabs, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";

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

const LOT_COLUMNS: EntityListColumn<DispatchLotRow>[] = [
  { key: "brokerInvoiceNo", label: "Invoice", accessor: (row) => row.brokerInvoiceNo, sortable: true, filter: "text", lov: false, cellClassName: "font-mono font-medium" },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.lotNo, sortable: true, filter: "text", lov: false },
  { key: "grade", label: "Grade", accessor: (row) => row.grade, sortable: true, filter: "select" },
  { key: "bags", label: "Bags", accessor: (row) => row.bags, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.bags ?? "—" },
  { key: "netWt", label: "Net kg", accessor: (row) => row.netWt, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.netWt == null ? "—" : Number(row.netWt).toFixed(2) },
  { key: "state", label: "State", accessor: (row) => row.state, sortable: true, filter: "select" },
];

const INVOICE_COLUMNS: EntityListColumn<DispatchInvoiceRow>[] = [
  {
    key: "invoiceNo",
    label: "Invoice no.",
    accessor: (row) => row.invoiceNo,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-mono font-semibold",
    render: (row) => <Link href={`/dashboard/auction/${row.id}`} className="text-green-700 hover:underline dark:text-green-400">{row.invoiceNo}</Link>,
  },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "invoiceDate", label: "Invoice date", accessor: (row) => row.invoiceDate, sortable: true, lov: false, searchInput: "date", cellClassName: "tabular-nums", render: (row) => row.invoiceDate ?? "—" },
  { key: "lotsCount", label: "Lots", accessor: (row) => row.lotsCount, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select" },
];

const LOT_LIST = { columns: LOT_COLUMNS, selectionMode: "single", add: false, edit: false, delete: false } satisfies ListDefinition<DispatchLotRow>;
const INVOICE_LIST = { columns: INVOICE_COLUMNS, selectionMode: "single", add: false, edit: false, delete: false } satisfies ListDefinition<DispatchInvoiceRow>;

export function DispatchDetailLists({ lots, invoices }: { lots: DispatchLotRow[]; invoices: DispatchInvoiceRow[] }) {
  return (
    <EntityListTabs
      label="Dispatch detail lists"
      tabs={[
        {
          id: "lots",
          label: "Invoice lots",
          count: `${lots.length} lots`,
          content: (
            <EntityList
              scope="dispatch-detail-lots"
              initialRows={lots}
              definition={LOT_LIST}
              getId={(row) => row.id}
              rowLabel={(row) => `Lot ${row.lotNo}`}
              title="Invoice lots"
              emptyMessage="No invoice lots in this dispatch."
            />
          ),
        },
        {
          id: "invoices",
          label: "Broker Invoices",
          count: `${invoices.length} invoices`,
          content: (
            <EntityList
              scope="dispatch-detail-invoices"
              initialRows={invoices}
              definition={INVOICE_LIST}
              getId={(row) => row.id}
              rowLabel={(row) => `Broker Invoice ${row.invoiceNo}`}
              title="Broker Invoices"
              emptyMessage="No Broker Invoices in this dispatch."
            />
          ),
        },
      ]}
    />
  );
}
