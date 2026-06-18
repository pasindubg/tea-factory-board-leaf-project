import { requireProfile } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { lkr, MONTHS } from "@/lib/money";
import { SubmitButton } from "@/components/submit-button";
import { generatePayments, setPaymentStatus } from "./actions";
import { PaymentsFilter } from "./payments-filter";

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
  return (
    <div>
      {params.error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {params.error}
        </p>
      )}
      {params.notice && (
        <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">
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
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            {rows.length ? "Regenerate" : "Generate"} {MONTHS[month - 1]} {year}
          </SubmitButton>
        </form>
      </div>

      <p className="mt-2 text-xs text-stone-500">
        Generating recomputes pending statements from current rates, tiers, and adjustments. Already-paid statements are
        left untouched.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">Kg</th>
              <th className="px-4 py-3 text-right">Gross</th>
              <th className="px-4 py-3 text-right">Deductions</th>
              <th className="px-4 py-3 text-right">Net payable</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const paid = r.status === "paid";
              return (
                <tr key={r.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{r.suppliers?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(r.total_kg).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{lkr(r.gross_amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-stone-500">{lkr(r.deduction_amount)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{lkr(r.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        paid ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-4">
                      <a href={`/dashboard/payments/${r.id}`} className="text-sm text-green-700 hover:underline">
                        Statement
                      </a>
                      <form action={setPaymentStatus}>
                        <input type="hidden" name="payment_id" value={r.id} />
                        <input type="hidden" name="paid" value={paid ? "false" : "true"} />
                        <input type="hidden" name="return_to" value={`/dashboard/payments?year=${year}&month=${month}`} />
                        <SubmitButton pendingText="…" className="text-sm text-stone-600 hover:underline">
                          {paid ? "Mark pending" : "Mark paid"}
                        </SubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-stone-400">
                  No statements for {MONTHS[month - 1]} {year}. Click Generate to create them from this month&apos;s
                  weighings.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-stone-200 font-medium">
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
    </div>
  );
}
