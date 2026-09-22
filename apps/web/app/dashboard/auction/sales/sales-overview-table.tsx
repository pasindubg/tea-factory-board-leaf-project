"use client";

import Link from "next/link";
import type { RevenueValidation } from "@tea/api";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { money } from "../format";
import { stateBucket, stateBucketOptions } from "../state-buckets";

export type SaleOverviewRow = {
  saleNo: string;
  status: string;
  href: string;
  dispatchNos: string[];
  saleDate: string | null;
  brokers: string[];
  totalLots: number;
  lotsSold: number;
  netKg: number;
  dispatchedKg: number;
  proceeds: number;
  totalValuation: number;
  valuedLots: number;
  soldValuation: number;
  valuedSoldLots: number;
  averagePerKg: number | null;
  valuationVariance: number | null;
  valuationVariancePct: number | null;
  totalDeductions: number | null;
  totalRevenue: number | null;
  revenuePerKg: number | null;
  bankCredit: number | null;
  vat: number;
  guaranteeLots: number;
  notValued: number;
  shutout: number;
  notSold: number;
  issues: string | null;
  revenueStatus: RevenueValidation["status"];
  revenueCheck: RevenueValidation;
};

const lkr = (value: number | null) => value == null ? "—" : `LKR ${money(value)}`;
const numeric = "text-right tabular-nums";

export const SALES_OVERVIEW_COLUMNS: EntityListColumn<SaleOverviewRow>[] = [
  { key: "saleNo", label: "Sale no.", accessor: (row) => row.saleNo, sortable: true, filter: "text", cellClassName: "font-medium", render: (row) => <Link href={row.href} className="text-green-700 hover:underline dark:text-green-400">{row.saleNo}</Link> },
  { key: "status", label: "Status", accessor: (row) => stateBucket(row.status).label, sortable: true, filter: "select", filterOptions: stateBucketOptions(["draft", "acknowledged", "valued", "sold", "settled"]), render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${stateBucket(row.status).style}`}>{stateBucket(row.status).label}</span> },
  { key: "dispatchNos", label: "Dispatch invoices", accessor: (row) => row.dispatchNos.join(", ") || null, sortable: true, filter: "text", cellClassName: "text-stone-600 dark:text-stone-400", render: (row) => row.dispatchNos.join(", ") || "—" },
  { key: "brokers", label: "Brokers", accessor: (row) => row.brokers.join(", ") || null, sortable: true, filter: "text", render: (row) => row.brokers.join(", ") || "—" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate ?? null, sortable: true, searchInput: "date", cellClassName: "text-stone-600 dark:text-stone-400", render: (row) => row.saleDate ?? "—" },
  { key: "lotsSold", label: "Lots sold", accessor: (row) => row.lotsSold, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => `${row.lotsSold}/${row.totalLots}` },
  // Two different quantities that both used to be called "Net kg": what went
  // INTO the sale, and what came out of it sold. Before the auction the second
  // is nil, which read as an empty sale.
  { key: "dispatchedKg", label: "Total kg to sale", accessor: (row) => row.dispatchedKg, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => `${money(row.dispatchedKg)} kg` },
  { key: "netKg", label: "Net kg sold", accessor: (row) => row.netKg, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => `${money(row.netKg)} kg` },
  { key: "totalValuation", label: "Total valuation", accessor: (row) => row.totalValuation, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => row.valuedLots === 0 ? "—" : `${lkr(row.totalValuation)} (${row.valuedLots} valued)` },
  { key: "soldValuation", label: "Sales valuation", accessor: (row) => row.soldValuation, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => row.valuedSoldLots === 0 ? "—" : lkr(row.soldValuation) },
  { key: "proceeds", label: "Total proceeds (before VAT)", accessor: (row) => row.proceeds, sortable: true, headerClassName: "text-right", cellClassName: `${numeric} font-medium`, render: (row) => lkr(row.proceeds) },
  { key: "averagePerKg", label: "Average/kg (sold)", accessor: (row) => row.averagePerKg, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => lkr(row.averagePerKg) },
  { key: "valuationVariance", label: "Valuation variance", accessor: (row) => row.valuationVariance, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => <Variance row={row} /> },
  { key: "totalDeductions", label: "Total deductions", accessor: (row) => row.totalDeductions, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => lkr(row.totalDeductions) },
  { key: "totalRevenue", label: "Total revenue", accessor: (row) => row.totalRevenue, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => lkr(row.totalRevenue) },
  { key: "revenuePerKg", label: "Revenue/kg (sold)", accessor: (row) => row.revenuePerKg, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => lkr(row.revenuePerKg) },
  { key: "bankCredit", label: "Bank credit (prompt)", accessor: (row) => row.bankCredit, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => lkr(row.bankCredit) },
  { key: "vat", label: "Total VAT", accessor: (row) => row.vat, sortable: true, headerClassName: "text-right", cellClassName: numeric, render: (row) => lkr(row.vat) },
  { key: "guaranteeLots", label: "Guarantee lots", accessor: (row) => row.guaranteeLots, sortable: true, headerClassName: "text-right", cellClassName: numeric },
  { key: "issues", label: "Issues", accessor: (row) => row.issues, filter: "text", minWidth: 300, render: (row) => <IssuePills row={row} /> },
  { key: "revenueStatus", label: "Sellers contracts", accessor: (row) => row.revenueStatus, filter: "text", minWidth: 280, render: (row) => <RevenuePill check={row.revenueCheck} /> },
];

function Variance({ row }: { row: SaleOverviewRow }) {
  if (row.valuationVariance == null || row.valuationVariancePct == null) return "—";
  const sign = row.valuationVariance >= 0 ? "+" : "−";
  const pctSign = row.valuationVariancePct >= 0 ? "+" : "−";
  return `${sign}LKR ${money(Math.abs(row.valuationVariance))} (${pctSign}${Math.abs(row.valuationVariancePct).toFixed(1)}%; ${row.valuedSoldLots} sold)`;
}

function IssuePills({ row }: { row: SaleOverviewRow }) {
  const issues = [["Not Valued", row.notValued], ["Shutout", row.shutout], ["Not sold", row.notSold]] as const;
  const visible = issues.filter(([, count]) => count > 0);
  if (visible.length === 0) return "—";
  return <div className="flex gap-1">{visible.map(([label, count]) => <span key={label} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">{label}: {count}</span>)}</div>;
}

function RevenuePill({ check }: { check: RevenueValidation }) {
  if (check.status === "pending" || check.status === "unavailable") return "—";
  if (check.status === "tallied") return <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">✓ Tallied with {check.documents} sellers contract{check.documents === 1 ? "" : "s"}</span>;
  if (check.status === "tallied-on-printed-insurance") return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Tallied — insurance differs by LKR {money(Math.abs(check.insuranceDifference))}</span>;
  return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">⚠ Off contracts by LKR {money(Math.abs(check.difference))}</span>;
}

const LIST = { columns: SALES_OVERVIEW_COLUMNS, selectionMode: "single" } satisfies ListDefinition<SaleOverviewRow>;

export function SalesOverviewTable({ rows }: { rows: SaleOverviewRow[] }) {
  return (
    <EntityList
      scope="auction-sales-overview"
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.saleNo}
      rowLabel={(row) => `sale ${row.saleNo}`}
      title="Auction sales"
      description="Sale-level totals assembled from all linked dispatch invoices."
      emptyMessage="No sales yet. Confirm a sellers contract to record auction sales."
      filteredEmptyMessage="No sales match these filters."
    />
  );
}
