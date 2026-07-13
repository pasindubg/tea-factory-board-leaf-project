import { requireProfile } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { MONTHS } from "@/lib/money";
import { SubmitButton } from "@/components/submit-button";
import { generatePayments } from "./actions";
import { PaymentsFilter } from "./payments-filter";
import { PaymentsTable, type PaymentTableRow } from "./payments-table";

type PaymentRow = {
  id: string;
  total_kg: string;
  gross_amount: string;
  bonus_amount: string;
  bonus_missed: string;
  deduction_amount: string;
  total_amount: string;
  status: string;
  suppliers: { name: string } | null;
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; error?: string; notice?: string }>;
}) {
  const { supabase } = await requireProfile(MANAGEMENT_ROLES);
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const { data } = await supabase
    .from("payments")
    .select("id, total_kg, gross_amount, bonus_amount, bonus_missed, deduction_amount, total_amount, status, suppliers(name)")
    .eq("period_year", year)
    .eq("period_month", month)
    .order("created_at");
  const rows = (data ?? []) as unknown as PaymentRow[];

  const totals = rows.reduce(
    (a, r) => ({
      kg: a.kg + Number(r.total_kg),
      gross: a.gross + Number(r.gross_amount),
      deduction: a.deduction + Number(r.deduction_amount),
      net: a.net + Number(r.total_amount),
    }),
    { kg: 0, gross: 0, deduction: 0, net: 0 },
  );

  const tableRows: PaymentTableRow[] = rows.map((r) => ({
    id: r.id,
    supplierName: r.suppliers?.name ?? "—",
    totalKg: Number(r.total_kg),
    grossAmount: Number(r.gross_amount),
    deductionAmount: Number(r.deduction_amount),
    totalAmount: Number(r.total_amount),
    status: r.status,
  }));

  return (
    <div>
      {params.error && (
        <p className="mb-4 rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {params.error}
        </p>
      )}
      {params.notice && (
        <p className="mb-4 rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400" role="status">
          {params.notice}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <PaymentsFilter year={year} month={month} />

        <form action={generatePayments}>
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <SubmitButton
            pendingText="Generating…"
            className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
          >
            {rows.length ? "Regenerate" : "Generate"} {MONTHS[month - 1]} {year}
          </SubmitButton>
        </form>
      </div>

      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
        Generating recomputes pending statements from current rates, tiers, and adjustments. Already-paid statements are
        left untouched.
      </p>

      <div className="mt-4">
        <PaymentsTable rows={tableRows} totals={totals} year={year} month={month} />
      </div>
    </div>
  );
}
