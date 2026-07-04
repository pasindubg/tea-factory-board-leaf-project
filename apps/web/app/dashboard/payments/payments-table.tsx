"use client";

import { SubmitButton } from "@/components/submit-button";
import { lkr } from "@/lib/money";
import { setPaymentStatus } from "./actions";
import { useListControls, SortButton, FilterCell, type ColumnDef } from "@/components/list-controls";

export type PaymentTableRow = {
  id: string;
  supplierName: string;
  totalKg: number;
  grossAmount: number;
  deductionAmount: number;
  totalAmount: number;
  status: string;
};

const COLUMNS: ColumnDef<PaymentTableRow>[] = [
  { key: "supplierName", label: "Supplier", accessor: (r) => r.supplierName, sortable: true, filter: "text" },
  { key: "totalKg", label: "Kg", accessor: (r) => r.totalKg, sortable: true },
  { key: "grossAmount", label: "Gross", accessor: (r) => r.grossAmount, sortable: true },
  { key: "deductionAmount", label: "Deductions", accessor: (r) => r.deductionAmount, sortable: true },
  { key: "totalAmount", label: "Net payable", accessor: (r) => r.totalAmount, sortable: true },
  { key: "status", label: "Status", accessor: (r) => r.status, sortable: true, filter: "select", filterOptions: [{ value: "pending", label: "pending" }, { value: "paid", label: "paid" }] },
];

export function PaymentsTable({
  rows,
  totals,
  year,
  month,
}: {
  rows: PaymentTableRow[];
  totals: { kg: number; gross: number; deduction: number; net: number };
  year: number;
  month: number;
}) {
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.key === "supplierName" || col.key === "status" ? "" : "text-right"}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
          {controls.hasFilters && (
            <tr className="border-b border-stone-100 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/40">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-1.5 font-normal">
                  <FilterCell col={col} controls={controls} />
                </th>
              ))}
              <th className="px-4 py-1.5"></th>
            </tr>
          )}
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const paid = r.status === "paid";
            return (
              <tr key={r.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                <td className="px-4 py-3 font-medium">{r.supplierName}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.totalKg.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{lkr(r.grossAmount)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-stone-500 dark:text-stone-400">{lkr(r.deductionAmount)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{lkr(r.totalAmount)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      paid ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-4">
                    <a href={`/dashboard/payments/${r.id}`} className="text-sm text-green-700 dark:text-green-400 hover:underline">
                      Statement
                    </a>
                    <form action={setPaymentStatus}>
                      <input type="hidden" name="payment_id" value={r.id} />
                      <input type="hidden" name="paid" value={paid ? "false" : "true"} />
                      <input type="hidden" name="return_to" value={`/dashboard/payments?year=${year}&month=${month}`} />
                      <SubmitButton pendingText="…" className="text-sm text-stone-600 dark:text-stone-400 hover:underline">
                        {paid ? "Mark pending" : "Mark paid"}
                      </SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No statements match these filters.
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                No statements for this period. Click Generate to create them from this month&apos;s weighings.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-stone-200 dark:border-stone-700 font-medium">
              <td className="px-4 py-3">Total ({rows.length})</td>
              <td className="px-4 py-3 text-right tabular-nums">{totals.kg.toFixed(2)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.gross)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.deduction)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.net)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
