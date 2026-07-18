"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { money } from "../format";

export type SaleOverviewRow = {
  saleNo: string;
  href: string;
  dispatchNos: string[];
  saleDate: string | null;
  brokers: string[];
  lotsSold: number;
  netKg: number;
  proceeds: number;
  vat: number;
  guaranteeLots: number;
};

const COLUMNS: EntityListColumn<SaleOverviewRow>[] = [
  { key: "saleNo", label: "Sale no.", accessor: (row) => row.saleNo, sortable: true, filter: "text", cellClassName: "font-medium", render: (row) => <Link href={row.href} className="text-green-700 hover:underline dark:text-green-400">{row.saleNo}</Link> },
  { key: "dispatchNos", label: "Broker invoices", accessor: (row) => row.dispatchNos.join(", ") || null, sortable: true, filter: "text", cellClassName: "text-stone-600 dark:text-stone-400", render: (row) => row.dispatchNos.join(", ") || "—" },
  { key: "brokers", label: "Brokers", accessor: (row) => row.brokers.join(", ") || null, sortable: true, filter: "text", render: (row) => row.brokers.join(", ") || "—" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate ?? null, sortable: true, searchInput: "date", cellClassName: "text-stone-600 dark:text-stone-400", render: (row) => row.saleDate ?? "—" },
  { key: "lotsSold", label: "Lots sold", accessor: (row) => row.lotsSold, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "netKg", label: "Net kg", accessor: (row) => row.netKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => money(row.netKg) },
  { key: "proceeds", label: "Proceeds", accessor: (row) => row.proceeds, sortable: true, headerClassName: "text-right", cellClassName: "text-right font-medium tabular-nums", render: (row) => money(row.proceeds) },
  { key: "vat", label: "VAT", accessor: (row) => row.vat, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => money(row.vat) },
  { key: "guaranteeLots", label: "Guarantee", accessor: (row) => row.guaranteeLots, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
];

const LIST = { columns: COLUMNS, selectionMode: "single" } satisfies ListDefinition<SaleOverviewRow>;

export function SalesOverviewTable({ rows }: { rows: SaleOverviewRow[] }) {
  return (
    <EntityList
      scope="auction-sales-overview"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.saleNo}
      rowLabel={(row) => `sale ${row.saleNo}`}
      title="Auction sales"
      description="Sale-level totals assembled from all linked broker invoices."
      emptyMessage="No sales yet. Confirm a sellers contract to record auction sales."
      filteredEmptyMessage="No sales match these filters."
    />
  );
}
