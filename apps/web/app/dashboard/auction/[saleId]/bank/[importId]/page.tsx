import Link from "next/link";
import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { reconcileBank } from "@tea/api";
import { confirmBankMatches } from "../../../actions";
import { BankResolver, type ResolverSettlement, type AuditRow } from "./bank-resolver";

const LKR = (n: number) => "Rs " + n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GRACE_DAYS = 7;

type SettlementStatus = "settled" | "cash-only" | "under-paid" | "over-paid" | "awaiting" | "unpaid";
const STATUS_STYLE: Record<SettlementStatus, string> = {
  settled: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300",
  "cash-only": "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300",
  "under-paid": "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300",
  "over-paid": "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300",
  awaiting: "bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300",
  unpaid: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300",
};

const daysAfter = (a: string, b: string) =>
  (new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86_400_000;

export default async function BankReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string; importId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { supabase } = await requireModuleAccess("auction");
  const { saleId, importId } = await params;
  const { notice } = await searchParams;
  const detail = `/dashboard/auction/${saleId}`;

  const { data: imp } = await supabase
    .from("doc_imports")
    .select("id, source_filename, sale_id, doc_type")
    .eq("id", importId)
    .single();
  if (!imp || imp.sale_id !== saleId || imp.doc_type !== "bank_csv") {
    return (
      <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-8 text-center text-stone-500 dark:text-stone-400">
        Bank import not found.{" "}
        <Link href={detail} className="text-green-700 dark:text-green-400 hover:underline">
          Back to sale
        </Link>
      </div>
    );
  }

  const { data: sale } = await supabase
    .from("auction_sales")
    .select("sale_no, prompt_date, brokers(name)")
    .eq("id", saleId)
    .single();
  const brokerName = (sale?.brokers as unknown as { name: string } | null)?.name ?? null;

  const [{ data: settlementRows }, { data: txns }, { data: vatRows }, { data: auditRows }] = await Promise.all([
    supabase.from("settlements").select("id, contract_no, total_net_proceeds, prompt_date").eq("sale_id", saleId),
    supabase
      .from("bank_txns")
      .select("id, txn_date, credit, description, matched_settlement_id")
      .eq("import_batch_id", importId)
      .order("txn_date"),
    supabase.from("sale_lines").select("vat_amount, on_guarantee").eq("sale_id", saleId),
    supabase
      .from("auction_audit")
      .select("action, detail, reason, actor, confidence_shown, created_at")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const settlements = settlementRows ?? [];
  const allTxns = txns ?? [];
  const credits = allTxns.filter((t) => Number(t.credit) > 0);
  const guaranteedVat = (vatRows ?? []).filter((v) => v.on_guarantee).reduce((s, v) => s + Number(v.vat_amount ?? 0), 0);
  // Statement coverage end — the "as of" date. If it predates the prompt date the
  // payment simply can't have arrived yet (don't alarm).
  const asOf = allTxns.reduce<string | null>((max, t) => (!max || t.txn_date > max ? (t.txn_date as string) : max), null);

  // Per-settlement status from credits already matched to it (in this batch).
  const matchedSumBySettlement = new Map<string, number>();
  for (const t of credits) {
    if (t.matched_settlement_id) {
      matchedSumBySettlement.set(
        t.matched_settlement_id as string,
        (matchedSumBySettlement.get(t.matched_settlement_id as string) ?? 0) + Number(t.credit),
      );
    }
  }

  const computed = settlements.map((st) => {
    const expected = Number(st.total_net_proceeds);
    const cashOnly = Number((expected - guaranteedVat).toFixed(2));
    const received = matchedSumBySettlement.get(st.id as string) ?? 0;
    const tol = Math.max(100, expected * 0.001);
    const prompt = (st.prompt_date as string) ?? sale?.prompt_date ?? null;
    let status: SettlementStatus;
    let note = "";
    if (received <= tol) {
      if (prompt && asOf && asOf < prompt) {
        status = "awaiting";
        note = "statement predates prompt date — expected, not yet received";
      } else if (prompt && asOf && daysAfter(asOf, prompt) <= GRACE_DAYS) {
        status = "awaiting";
        note = "within grace window of the prompt date";
      } else {
        status = "unpaid";
        note = prompt ? `overdue since ${prompt}` : "no prompt date on file";
      }
    } else if (Math.abs(received - expected) <= tol) {
      status = "settled";
    } else if (Math.abs(received - cashOnly) <= tol) {
      status = "cash-only";
      note = "cash VAT only — guarantee pending";
    } else if (received < expected - tol) {
      status = "under-paid";
      note = `${LKR(expected - received)} short`;
    } else {
      status = "over-paid";
      note = `${LKR(received - expected)} over`;
    }
    return { id: st.id as string, contractNo: st.contract_no as string, expected, cashOnly, received, status, note, prompt };
  });

  // Suggested auto-matches still to apply (unmatched credits).
  const unmatchedCredits = credits.filter((t) => !t.matched_settlement_id);
  const suggested = reconcileBank(
    settlements.map((st) => ({
      settlementId: st.id as string,
      contractNo: st.contract_no as string,
      totalNetProceeds: Number(st.total_net_proceeds),
      guaranteedVat,
      promptDate: (st.prompt_date as string) ?? sale?.prompt_date ?? "",
    })),
    unmatchedCredits.map((c) => ({
      txnId: c.id as string,
      txnDate: c.txn_date as string,
      credit: Number(c.credit),
      description: (c.description as string) ?? "",
      chequeNo: null,
    })),
  );

  const unattributed = unmatchedCredits.filter((c) => !suggested.matches.some((m) => m.bankTxnId === c.id));
  const unpaidSettlements: ResolverSettlement[] = computed
    .filter((c) => c.status !== "settled" && c.status !== "over-paid")
    .map((c) => ({
      settlementId: c.id,
      contractNo: c.contractNo,
      totalNetProceeds: c.expected,
      cashOnly: c.cashOnly,
      promptDate: c.prompt ?? "",
      brokerName,
    }));
  const audit: AuditRow[] = (auditRows ?? [])
    .filter((a) => String(a.action).startsWith("Bank"))
    .map((a) => ({
      action: a.action as string,
      detail: a.detail as string,
      reason: (a.reason as string) ?? null,
      actor: a.actor as string,
      confidenceShown: a.confidence_shown != null ? Number(a.confidence_shown) : null,
      createdAt: a.created_at as string,
    }));

  const totalExpected = computed.reduce((s, c) => s + c.expected, 0);
  const totalReceived = computed.reduce((s, c) => s + c.received, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={detail} className="text-sm text-green-700 dark:text-green-400 hover:underline">
          ← Sale {sale?.sale_no ?? ""}
        </Link>
        <h2 className="mt-1 text-xl font-semibold">Reconciliation ④ — settlement ↔ bank</h2>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {imp.source_filename ?? "bank.csv"} · {credits.length} credit(s) · statement to {asOf ?? "—"} · prompt{" "}
          {sale?.prompt_date ?? "—"}
        </p>
      </div>

      {notice && <p className="rounded-md bg-green-50 dark:bg-green-950 px-3 py-2 text-sm text-green-800 dark:text-green-400">{notice}</p>}

      {settlements.length === 0 && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
          No settlements for this sale yet — ingest the Sellers Contract first, then reconcile the bank statement.
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-3 py-1 text-stone-700 dark:text-stone-300">
          Expected: <strong>{LKR(totalExpected)}</strong>
        </span>
        <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-3 py-1 text-stone-700 dark:text-stone-300">
          Received: <strong>{LKR(totalReceived)}</strong>
        </span>
        <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-3 py-1 text-stone-700 dark:text-stone-300">
          Unattributed credits: <strong>{unattributed.length}</strong>
        </span>
      </div>

      {/* Per-settlement status */}
      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
              <th className="px-3 py-3">Contract</th>
              <th className="px-3 py-3 text-right">Expected</th>
              <th className="px-3 py-3 text-right">Cash-only</th>
              <th className="px-3 py-3 text-right">Received</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {computed.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                <td className="px-3 py-2 font-medium">{c.contractNo}</td>
                <td className="px-3 py-2 text-right tabular-nums">{LKR(c.expected)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500 dark:text-stone-400">{LKR(c.cashOnly)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.received > 0 ? LKR(c.received) : "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-stone-500 dark:text-stone-400">{c.note}</td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-stone-400 dark:text-stone-500">No settlements.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Apply suggested auto-matches */}
      {suggested.matches.length > 0 && (
        <form action={confirmBankMatches.bind(null, saleId, importId)} className="flex items-center gap-3">
          <SubmitButton
            pendingText="Matching…"
            className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
          >
            Apply {suggested.matches.length} suggested match(es)
          </SubmitButton>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {suggested.summary.fullMatches} full · {suggested.summary.cashOnlyMatches} cash-only · {suggested.summary.chequeMatches} cheque
          </span>
        </form>
      )}

      {/* Unattributed-credit resolver */}
      {unattributed.length > 0 && unpaidSettlements.length > 0 && (
        <BankResolver
          saleId={saleId}
          importId={importId}
          credits={unattributed.map((c) => ({
            txnId: c.id as string,
            txnDate: c.txn_date as string,
            credit: Number(c.credit),
            description: (c.description as string) ?? "",
          }))}
          settlements={unpaidSettlements}
          audit={audit}
        />
      )}

      {unattributed.length > 0 && unpaidSettlements.length === 0 && (
        <p className="rounded-md bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 px-3 py-2 text-sm text-stone-500 dark:text-stone-400">
          {unattributed.length} unattributed credit(s), but every settlement is already accounted for — these likely
          belong to another sale.
        </p>
      )}
    </div>
  );
}
