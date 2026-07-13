import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import { lkr, MONTHS } from "@/lib/money";
import { SubmitButton } from "@/components/submit-button";
import { setPaymentStatus } from "../actions";
import { PrintButton } from "./print-button";

type Payment = {
  id: string;
  period_year: number;
  period_month: number;
  total_kg: string;
  gross_amount: string;
  bonus_amount: string;
  bonus_missed: string;
  deduction_amount: string;
  total_amount: string;
  status: string;
  paid_at: string | null;
  generated_at: string;
  suppliers: { name: string; area: string | null; phone: string | null } | null;
};
type Line = {
  id: string;
  line_type: string;
  label: string | null;
  quantity: string | null;
  rate: string | null;
  amount: string;
  sort_order: number;
};

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireProfile(MANAGEMENT_ROLES);
  const { id } = await params;

  const [{ data: payment }, { data: lines }, { data: factory }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, period_year, period_month, total_kg, gross_amount, bonus_amount, bonus_missed, deduction_amount, total_amount, status, paid_at, generated_at, suppliers(name, area, phone)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("payment_lines").select("id, line_type, label, quantity, rate, amount, sort_order").eq("payment_id", id).order("sort_order"),
    supabase.from("factories").select("name, location").eq("id", profile.factory_id).maybeSingle(),
  ]);
  if (!payment) notFound();
  const p = payment as unknown as Payment;
  const lineRows = (lines ?? []) as Line[];
  const f = factory as { name: string; location: string | null } | null;
  const paid = p.status === "paid";
  const bonusMissed = Number(p.bonus_missed);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/dashboard/payments?year=${p.period_year}&month=${p.period_month}`} className="text-sm text-green-700 dark:text-green-400 hover:underline">
          ← Back to statements
        </a>
        <div className="flex gap-3">
          <form action={setPaymentStatus}>
            <input type="hidden" name="payment_id" value={p.id} />
            <input type="hidden" name="paid" value={paid ? "false" : "true"} />
            <input type="hidden" name="return_to" value={`/dashboard/payments/${p.id}`} />
            <SubmitButton pendingText="…" className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800">
              {paid ? "Mark pending" : "Mark paid"}
            </SubmitButton>
          </form>
          <PrintButton />
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8">
        <div className="flex items-start justify-between border-b border-stone-200 dark:border-stone-700 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-green-800 dark:text-green-400">{f?.name ?? "Tea Factory"}</h2>
            {f?.location && <p className="text-sm text-stone-500 dark:text-stone-400">{f.location}</p>}
            <p className="mt-2 text-sm font-medium">Green-leaf payment statement</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{MONTHS[p.period_month - 1]} {p.period_year}</p>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${paid ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-400"}`}>
              {p.status}
            </span>
          </div>
        </div>

        <div className="flex justify-between py-4 text-sm">
          <div>
            <p className="text-stone-500 dark:text-stone-400">Supplier</p>
            <p className="font-medium">{p.suppliers?.name ?? "—"}</p>
            {p.suppliers?.area && <p className="text-stone-500 dark:text-stone-400">{p.suppliers.area}</p>}
          </div>
          <div className="text-right">
            <p className="text-stone-500 dark:text-stone-400">Total green leaf</p>
            <p className="font-medium">{Number(p.total_kg).toFixed(2)} kg</p>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Kg</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineRows.map((l) => {
              const amt = Number(l.amount);
              return (
                <tr key={l.id} className="border-b border-stone-100 dark:border-stone-800">
                  <td className="py-2">{l.label ?? l.line_type}</td>
                  <td className="py-2 text-right tabular-nums text-stone-500 dark:text-stone-400">{l.quantity ? Number(l.quantity).toFixed(2) : ""}</td>
                  <td className="py-2 text-right tabular-nums text-stone-500 dark:text-stone-400">{l.rate ? Number(l.rate).toFixed(2) : ""}</td>
                  <td className={`py-2 text-right tabular-nums ${amt < 0 ? "text-red-700 dark:text-red-400" : ""}`}>{lkr(amt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-stone-500 dark:text-stone-400">Gross (leaf + bonus)</span><span className="tabular-nums">{lkr(p.gross_amount)}</span></div>
          <div className="flex justify-between"><span className="text-stone-500 dark:text-stone-400">Deductions</span><span className="tabular-nums">−{lkr(p.deduction_amount)}</span></div>
          <div className="flex justify-between border-t border-stone-200 dark:border-stone-700 pt-2 text-base font-semibold">
            <span>Net payable</span><span className="tabular-nums">{lkr(p.total_amount)}</span>
          </div>
        </div>

        {bonusMissed > 0 && (
          <p className="mt-4 rounded-md bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-400">
            💡 Reaching the top quality tier would have earned an extra <span className="font-semibold">{lkr(bonusMissed)}</span> this month.
          </p>
        )}

        <p className="mt-6 text-xs text-stone-400 dark:text-stone-500">
          Generated {new Date(p.generated_at).toLocaleString()}{p.paid_at ? ` · Paid ${new Date(p.paid_at).toLocaleString()}` : ""}
        </p>
      </div>
    </div>
  );
}
