"use client";

import Link from "next/link";
import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSelectionCell,
  ListSelectionHeader,
  ListSurface,
  SortButton,
  useFrameworkListData,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { lkr, MONTHS } from "@/lib/money";
import type { PaymentStatementListRow } from "@/lib/list-resources";
import { generatePayments, setPaymentStatus } from "./actions";

export type PaymentTableRow = PaymentStatementListRow;

const COLUMNS: ColumnDef<PaymentTableRow>[] = [
  { key: "supplierName", label: "Supplier", accessor: (row) => row.supplierName, sortable: true, filter: "text" },
  { key: "totalKg", label: "Kg", accessor: (row) => row.totalKg, sortable: true, searchInput: "number", lov: false },
  { key: "grossAmount", label: "Gross", accessor: (row) => row.grossAmount, sortable: true, searchInput: "number", lov: false },
  { key: "deductionAmount", label: "Deductions", accessor: (row) => row.deductionAmount, sortable: true, searchInput: "number", lov: false },
  { key: "totalAmount", label: "Net payable", accessor: (row) => row.totalAmount, sortable: true, searchInput: "number", lov: false },
  {
    key: "status",
    label: "Status",
    accessor: (row) => row.status,
    sortable: true,
    filter: "select",
    filterOptions: [
      { value: "pending", label: "pending" },
      { value: "paid", label: "paid" },
    ],
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: false,
  edit: false,
  delete: false,
  commands: [
    { id: "mark-paid", label: "Mark paid", requiresSelection: true },
    { id: "mark-pending", label: "Mark pending", requiresSelection: true },
  ],
} satisfies ListDefinition<PaymentTableRow>;

export function PaymentsTable({
  rows: initialRows,
  year,
  month,
  canManage,
}: {
  rows: PaymentTableRow[];
  year: number;
  month: number;
  canManage: boolean;
}) {
  const { rows, refreshing, mutationAction } = useFrameworkListData({
    initialRows,
    resource: { key: "payments.statements", params: { year, month } },
  });
  const controls = useListControls(rows, LIST.columns);
  const visibleRows = controls.rows;
  const selection = useListSelection(rows, { mode: LIST.selectionMode, getId: (row) => row.id });
  const selectedRows = rows.filter((row) => selection.selectedIds.has(row.id));
  const totals = rows.reduce(
    (total, row) => ({
      kg: total.kg + row.totalKg,
      gross: total.gross + row.grossAmount,
      deduction: total.deduction + row.deductionAmount,
      net: total.net + row.totalAmount,
    }),
    { kg: 0, gross: 0, deduction: 0, net: 0 },
  );

  return (
    <ListSurface
      title="Payment statements"
      description={`${MONTHS[month - 1]} ${year} supplier statements. Totals update with this list after every command.`}
      refreshing={refreshing}
    >
      <ListCommandToolbar mode={LIST.selectionMode} count={selection.selectedCount}>
        {canManage && (
          <>
            <form action={mutationAction(generatePayments, { onSuccess: selection.clear })}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <SubmitButton
                pendingText="Generating…"
                disabled={refreshing}
                className="min-h-10 rounded-full border border-green-300 bg-white px-4 text-sm font-semibold text-green-800 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-green-800 dark:bg-stone-900 dark:text-green-300 dark:hover:bg-green-950"
              >
                {rows.length ? "Regenerate" : "Generate"}
              </SubmitButton>
            </form>
            <StatusCommand
              action={mutationAction(setPaymentStatus, { onSuccess: selection.clear })}
              ids={[...selection.selectedIds]}
              paid
              label={LIST.commands[0].label}
              pendingLabel="Marking paid…"
              disabled={refreshing || !selectedRows.some((row) => row.status !== "paid")}
            />
            <StatusCommand
              action={mutationAction(setPaymentStatus, { onSuccess: selection.clear })}
              ids={[...selection.selectedIds]}
              paid={false}
              label={LIST.commands[1].label}
              pendingLabel="Marking pending…"
              disabled={refreshing || !selectedRows.some((row) => row.status === "paid")}
            />
          </>
        )}
      </ListCommandToolbar>

      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              <ListSelectionHeader
                mode={LIST.selectionMode}
                scope="payment-statements"
                checked={selection.allVisibleSelected(visibleRows)}
                onChange={() => selection.toggleVisible(visibleRows)}
                disabled={refreshing}
              />
              {LIST.columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 ${column.key === "supplierName" || column.key === "status" ? "" : "text-right"}`}
                >
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((statement) => {
              const paid = statement.status === "paid";
              return (
                <tr
                  key={statement.id}
                  {...selection.rowProps(statement.id, refreshing)}
                  className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(statement.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <ListSelectionCell
                    mode={LIST.selectionMode}
                    scope="payment-statements"
                    id={statement.id}
                    label={`${statement.supplierName} statement`}
                    checked={selection.isSelected(statement.id)}
                    onChange={() => selection.toggle(statement.id)}
                    disabled={refreshing}
                  />
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/dashboard/payments/${statement.id}`} className="text-green-800 hover:underline dark:text-green-300">
                      {statement.supplierName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{statement.totalKg.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{lkr(statement.grossAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-500 dark:text-stone-400">{lkr(statement.deductionAmount)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{lkr(statement.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paid ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400"}`}>
                      {statement.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  {rows.length
                    ? "No statements match these filters."
                    : "No statements for this period. Owners and managers can generate them from the period's weighings."}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-stone-200 font-medium dark:border-stone-700">
                <td />
                <td className="px-4 py-3">Total ({rows.length})</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.kg.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.gross)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.deduction)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.net)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ListSurface>
  );
}

function StatusCommand({
  action,
  ids,
  paid,
  label,
  pendingLabel,
  disabled,
}: {
  action: (formData: FormData) => Promise<void>;
  ids: string[];
  paid: boolean;
  label: string;
  pendingLabel: string;
  disabled: boolean;
}) {
  return (
    <form action={action}>
      {ids.map((id) => <input key={id} type="hidden" name="selected_ids" value={id} />)}
      <input type="hidden" name="paid" value={String(paid)} />
      <SubmitButton
        pendingText={pendingLabel}
        disabled={disabled}
        className="min-h-10 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-green-50 hover:text-green-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300"
      >
        {label}
      </SubmitButton>
    </form>
  );
}
