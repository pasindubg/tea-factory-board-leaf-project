"use client";

import Link from "next/link";
import { money } from "../format";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";

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

const COLUMNS: ColumnDef<SaleOverviewRow>[] = [
  { key: "saleNo", label: "Sale no.", accessor: (r) => r.saleNo, sortable: true, filter: "text" },
  { key: "dispatchNos", label: "Broker invoices", accessor: (r) => r.dispatchNos.join(", ") || null, sortable: true, filter: "text" },
  { key: "brokers", label: "Brokers", accessor: (r) => r.brokers.join(", ") || null, sortable: true, filter: "text" },
  { key: "saleDate", label: "Sale date", accessor: (r) => r.saleDate ?? null, sortable: true, searchInput: "date" },
  { key: "lotsSold", label: "Lots sold", accessor: (r) => r.lotsSold, sortable: true },
  { key: "netKg", label: "Net kg", accessor: (r) => r.netKg, sortable: true },
  { key: "proceeds", label: "Proceeds", accessor: (r) => r.proceeds, sortable: true },
  { key: "vat", label: "VAT", accessor: (r) => r.vat, sortable: true },
  { key: "guaranteeLots", label: "Guarantee", accessor: (r) => r.guaranteeLots, sortable: true },
];

const RIGHT_ALIGNED = new Set(["lotsSold", "netKg", "proceeds", "vat", "guaranteeLots"]);

export function SalesOverviewTable({ rows }: { rows: SaleOverviewRow[] }) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {COLUMNS.map((col) => (
                <th key={col.key} className={`px-4 py-3 ${RIGHT_ALIGNED.has(col.key) ? "text-right" : ""}`}>
                  {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((sale) => (
              <tr key={sale.saleNo} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                <td className="px-4 py-2 font-medium">
                  <Link href={sale.href} className="text-green-700 hover:underline dark:text-green-400">
                    {sale.saleNo}
                  </Link>
                </td>
                <td className="px-4 py-2 text-stone-600 dark:text-stone-400">{sale.dispatchNos.join(", ") || "—"}</td>
                <td className="px-4 py-2">{sale.brokers.join(", ") || "—"}</td>
                <td className="px-4 py-2 text-stone-600 dark:text-stone-400">{sale.saleDate ?? "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{sale.lotsSold}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(sale.netKg)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{money(sale.proceeds)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(sale.vat)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{sale.guaranteeLots}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && rows.length > 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  No sales match these filters.
                </td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  No sales yet. Confirm a sellers contract to record auction sales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
