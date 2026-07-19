"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import { lkr, MONTHS } from "@/lib/money";
import type { PaymentStatementListRow } from "@/lib/list-resources";
import { generatePayments, setPaymentStatus } from "./actions";

export type PaymentTableRow = PaymentStatementListRow;

const COLUMNS: EntityListColumn<PaymentTableRow>[] = [
  {
    key: "supplierName",
    label: "Supplier",
    accessor: (row) => row.supplierName,
    sortable: true,
    filter: "text",
    cellClassName: "font-medium",
    render: (row) => <Link href={`/dashboard/payments/${row.id}`} className="text-green-800 hover:underline dark:text-green-300">{row.supplierName}</Link>,
  },
  { key: "totalKg", label: "Kg", accessor: (row) => row.totalKg, sortable: true, searchInput: "number", lov: false, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.totalKg.toFixed(2) },
  { key: "grossAmount", label: "Gross", accessor: (row) => row.grossAmount, sortable: true, searchInput: "number", lov: false, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => lkr(row.grossAmount) },
  { key: "deductionAmount", label: "Deductions", accessor: (row) => row.deductionAmount, sortable: true, searchInput: "number", lov: false, headerClassName: "text-right", cellClassName: "text-right tabular-nums text-stone-500 dark:text-stone-400", render: (row) => lkr(row.deductionAmount) },
  { key: "totalAmount", label: "Net payable", accessor: (row) => row.totalAmount, sortable: true, searchInput: "number", lov: false, headerClassName: "text-right", cellClassName: "text-right font-medium tabular-nums", render: (row) => lkr(row.totalAmount) },
  {
    key: "status",
    label: "Status",
    accessor: (row) => row.status,
    sortable: true,
    filter: "select",
    filterOptions: [{ value: "pending", label: "pending" }, { value: "paid", label: "paid" }],
    render: (row) => <StatusBadge paid={row.status === "paid"} />,
  },
];

const LIST = {
  columns: COLUMNS,
  selectionMode: "multi",
  add: false,
  edit: false,
  delete: false,
} satisfies ListDefinition<PaymentTableRow>;

export function PaymentsTable({
  rows,
  year,
  month,
  canManage,
}: {
  rows: PaymentTableRow[];
  year: number;
  month: number;
  canManage: boolean;
}) {
  return (
    <EntityList
      resource={{ key: "payments.statements", params: { year, month } }}
      initialRows={rows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `${row.supplierName} statement`}
      title="Payment statements"
      description={`${MONTHS[month - 1]} ${year} supplier statements. Totals update with this list after every command.`}
      emptyMessage="No statements for this period. Owners and managers can generate them from the period's weighings."
      commands={[
        {
          id: "generate",
          label: ({ rows: liveRows }) => liveRows.length ? "Regenerate" : "Generate",
          pendingLabel: "Generating…",
          visible: canManage,
          run: () => generateStatements(year, month),
        },
        {
          id: "mark-paid",
          label: "Mark paid",
          pendingLabel: "Marking paid…",
          visible: canManage,
          disabled: ({ selectedRows }) => !selectedRows.some((row) => row.status !== "paid"),
          run: ({ selectedRows }) => changeStatus(selectedRows, true),
        },
        {
          id: "mark-pending",
          label: "Mark pending",
          pendingLabel: "Marking pending…",
          visible: canManage,
          disabled: ({ selectedRows }) => !selectedRows.some((row) => row.status === "paid"),
          run: ({ selectedRows }) => changeStatus(selectedRows, false),
        },
      ]}
      footer={({ rows: liveRows, selectionColumn }) => {
        const totals = liveRows.reduce(
          (total, row) => ({
            kg: total.kg + row.totalKg,
            gross: total.gross + row.grossAmount,
            deduction: total.deduction + row.deductionAmount,
            net: total.net + row.totalAmount,
          }),
          { kg: 0, gross: 0, deduction: 0, net: 0 },
        );
        return (
          <tr className="border-t border-stone-200 font-medium dark:border-stone-700">
            {selectionColumn && <td />}
            <td className="px-4 py-3">Total ({liveRows.length})</td>
            <td className="px-4 py-3 text-right tabular-nums">{totals.kg.toFixed(2)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.gross)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.deduction)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{lkr(totals.net)}</td>
            <td />
          </tr>
        );
      }}
    />
  );
}

function generateStatements(year: number, month: number) {
  const formData = new FormData();
  formData.set("year", String(year));
  formData.set("month", String(month));
  return generatePayments(formData);
}

function changeStatus(rows: PaymentTableRow[], paid: boolean) {
  const formData = new FormData();
  rows.forEach((row) => formData.append("selected_ids", row.id));
  formData.set("paid", String(paid));
  return setPaymentStatus(formData);
}

function StatusBadge({ paid }: { paid: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paid ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400"}`}>
      {paid ? "paid" : "pending"}
    </span>
  );
}
