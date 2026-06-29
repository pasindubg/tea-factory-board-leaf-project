"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rankSettlements, matchBand, type UnpaidSettlement, type UnattributedCredit } from "@tea/api";
import { linkBankCredit } from "../../../actions";

// Bank resolver (#20) — reuses the orphan-resolver UX for the bank side: link an
// UNATTRIBUTED credit to an UNPAID settlement. Same stone/green theme, same
// transparent per-dimension breakdown (amount / date / narration) from match-bank.
// Bank narration is garbage, so nothing auto-commits — suggest, human confirms,
// audit it.

export type ResolverCredit = { txnId: string; txnDate: string; credit: number; description: string };
export type ResolverSettlement = UnpaidSettlement;
export type AuditRow = {
  action: string;
  detail: string;
  reason: string | null;
  actor: string;
  confidenceShown: number | null;
  createdAt: string;
};

const band = (c: number) => {
  const b = matchBand(c);
  return b === "high"
    ? { label: "High", text: "text-green-700 dark:text-green-400", bar: "bg-green-600", ring: "border-green-400/50 dark:border-green-600/40" }
    : b === "medium"
      ? { label: "Medium", text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500", ring: "border-amber-300/60 dark:border-amber-600/30" }
      : { label: "Low", text: "text-stone-500 dark:text-stone-400", bar: "bg-stone-400", ring: "border-stone-200 dark:border-stone-700" };
};
const toneText: Record<string, string> = {
  good: "text-green-700 dark:text-green-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-stone-500 dark:text-stone-400",
};
const LKR = (n: number) => "Rs " + n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BankResolver({
  saleId,
  importId,
  credits,
  settlements,
  audit,
}: {
  saleId: string;
  importId: string;
  credits: ResolverCredit[];
  settlements: ResolverSettlement[];
  audit: AuditRow[];
}) {
  const [idx, setIdx] = useState(0);
  const [linking, setLinking] = useState<{ s: ResolverSettlement; confidence: number } | null>(null);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const credit = credits[Math.min(idx, Math.max(0, credits.length - 1))];
  const ranked = useMemo(() => {
    if (!credit) return [];
    const c: UnattributedCredit = { txnId: credit.txnId, txnDate: credit.txnDate, credit: credit.credit, description: credit.description };
    return rankSettlements(c, settlements);
  }, [credit, settlements]);

  if (credits.length === 0 || settlements.length === 0) return null;

  const confirmLink = () => {
    if (!linking || !credit) return;
    startTransition(() => {
      void linkBankCredit({
        saleId, importId, txnId: credit.txnId,
        settlementId: linking.s.settlementId, contractNo: linking.s.contractNo,
        credit: credit.credit, confidence: linking.confidence, reason: reason.trim() || undefined,
      }).then(() => router.refresh());
    });
    setLinking(null);
    setReason("");
    setIdx(0);
  };

  return (
    <div className={`rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/60 p-4 ${isPending ? "opacity-60" : ""}`}>
      <div className="text-sm font-medium text-stone-700 dark:text-stone-200">Resolve unattributed credits</div>
      <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
        Pick the unpaid settlement a credit belongs to. Nothing is auto-linked — every link is yours and is logged.
      </p>

      {/* Credit selector */}
      {credits.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {credits.map((c, i) => (
            <button
              key={c.txnId}
              onClick={() => setIdx(i)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                i === idx
                  ? "bg-green-700 dark:bg-green-600 text-white"
                  : "border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}
            >
              {LKR(c.credit)}
            </button>
          ))}
        </div>
      )}

      {/* Credit card */}
      <div className="mt-3 rounded-lg border border-amber-300/60 dark:border-amber-600/30 bg-amber-50 dark:bg-amber-950/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs text-stone-500 dark:text-stone-400">credit {credit.txnDate}</div>
            <div className="text-base font-semibold text-stone-800 dark:text-stone-100">{LKR(credit.credit)}</div>
          </div>
          <div className="max-w-[55%] truncate text-right text-xs text-stone-500 dark:text-stone-400" title={credit.description}>
            {credit.description || "—"}
          </div>
        </div>
      </div>

      {/* Settlement candidates */}
      <div className="mt-3 space-y-2">
        {ranked.map((r) => {
          const b = band(r.confidence);
          return (
            <div key={r.settlement.settlementId} className={`rounded-lg border ${b.ring} bg-white dark:bg-stone-900 p-3`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500 dark:text-stone-400">contract {r.settlement.contractNo}</span>
                    <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">{LKR(r.settlement.totalNetProceeds)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    {r.dims.map((d) => (
                      <span key={d.key} className="inline-flex items-center gap-1.5">
                        <span className="text-stone-400 dark:text-stone-500">{d.label}:</span>
                        <span className={toneText[d.tone]}>{d.detail}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="w-32 shrink-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className={b.text}>{b.label}</span>
                    <span className={`font-mono ${b.text}`}>{Math.round(r.confidence * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div className={`h-full ${b.bar}`} style={{ width: `${Math.round(r.confidence * 100)}%` }} />
                  </div>
                </div>
              </div>
              <div className="mt-2 border-t border-stone-100 dark:border-stone-800 pt-2">
                <button
                  disabled={isPending}
                  onClick={() => setLinking({ s: r.settlement, confidence: r.confidence })}
                  className="rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 dark:hover:bg-green-700 disabled:opacity-50"
                >
                  Link this credit → {r.settlement.contractNo}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Audit trail */}
      {audit.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Audit trail</div>
          <ul className="divide-y divide-stone-100 dark:divide-stone-800 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
            {audit.map((a, i) => (
              <li key={i} className="px-3 py-2 text-xs">
                <span className="font-medium text-stone-700 dark:text-stone-200">{a.action}</span>
                <span className="text-stone-500 dark:text-stone-400"> · {a.detail}</span>
                {a.confidenceShown != null && (
                  <span className="text-stone-400 dark:text-stone-500"> · shown {Math.round(a.confidenceShown * 100)}%</span>
                )}
                {a.reason && <div className="text-stone-400 dark:text-stone-500">reason: {a.reason}</div>}
                <div className="text-stone-400 dark:text-stone-500">by {a.actor} · {new Date(a.createdAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Confirm dialog */}
      {linking && credit && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5">
            <h3 className="text-base font-semibold text-stone-800 dark:text-stone-100">Confirm bank link</h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Link the {LKR(credit.credit)} credit on {credit.txnDate} to settlement{" "}
              <span className="font-mono">{linking.s.contractNo}</span> (expected {LKR(linking.s.totalNetProceeds)})?
            </p>
            <label className="mt-3 block text-xs text-stone-500 dark:text-stone-400">Reason (optional, kept in the audit trail)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. broker confirmed this transfer covers contract 0110"
              className="mt-1 w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-950 p-2 text-sm text-stone-700 dark:text-stone-200"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setLinking(null); setReason(""); }}
                className="rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmLink}
                disabled={isPending}
                className="rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700 disabled:opacity-50"
              >
                Confirm link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
