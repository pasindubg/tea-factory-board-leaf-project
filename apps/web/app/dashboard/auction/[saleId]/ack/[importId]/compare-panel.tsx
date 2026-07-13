"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rankCandidates, matchBand, type OrphanLot, type CandidateLot } from "@tea/api";
import {
  linkOrphanLot,
  markShutout,
  markMissing,
  markPending,
  rejectCandidate,
} from "../../../actions";

// Orphan-resolver "Compare" panel (#19). Re-themed from the previous chat's
// OrphanResolver (dark neutral/emerald → the app's light+dark stone/green) and fed
// REAL reconciliation data: pending/invoiced lots (orphans) vs "unexpected" ack
// lots (candidates). Ranking + per-dimension transparency come from @tea/api's
// match-orphans scoring core — nothing auto-links; every decision is the user's
// and is written to auction_audit.

// dispatchId = the orphan lot's OWN dispatch (may be a sibling dispatch in the
// same sale group, not the one whose ack page is open).
export type Orphan = { lotId: string; dispatchId?: string; invoiceNo: string; grade: string; netWt: number; markCode: string | null };
export type Candidate = { key: string; lotNo: string | null; grade: string; netWt: number; markCode: string | null };
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

export function ComparePanel({
  saleId,
  orphans,
  candidates,
  audit,
}: {
  saleId: string;
  orphans: Orphan[];
  candidates: Candidate[];
  audit: AuditRow[];
}) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [rejected, setRejected] = useState<Set<string>>(() => new Set());
  const [linking, setLinking] = useState<{ candidate: Candidate; confidence: number; delta: number } | null>(null);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const orphan = orphans[Math.min(idx, Math.max(0, orphans.length - 1))];

  const ranked = useMemo(() => {
    if (!orphan) return [];
    const o: OrphanLot = { invoiceNo: orphan.invoiceNo, grade: orphan.grade, netWt: orphan.netWt, markCode: orphan.markCode };
    const pool: CandidateLot[] = candidates.map((c) => ({
      key: c.key, lotNo: c.lotNo, grade: c.grade, netWt: c.netWt, markCode: c.markCode,
    }));
    return rankCandidates(o, pool);
  }, [orphan, candidates]);

  const visible = useMemo(
    () => ranked.filter((r) => !rejected.has(r.candidate.key) && r.confidence >= minConfidence),
    [ranked, rejected, minConfidence],
  );

  if (orphans.length === 0) {
    return null; // nothing factory-side left to resolve
  }
  // Note: we still render with zero candidates — there may be no "unexpected" ack
  // lot to link to, but the user must still be able to record an outcome
  // (shut out / missing / leave unresolved) for each unacknowledged invoiced lot.

  const run = (fn: () => Promise<void>) => startTransition(() => { void fn().then(() => router.refresh()); });

  const confirmLink = () => {
    if (!linking || !orphan) return;
    const c = linking.candidate;
    run(() =>
      linkOrphanLot({
        saleId: orphan.dispatchId ?? saleId,
        lotId: orphan.lotId,
        invoiceNo: orphan.invoiceNo,
        orphanNetWt: orphan.netWt,
        candidateLotNo: c.lotNo,
        candidateMarkCode: c.markCode,
        candidateGrade: c.grade,
        candidateNetWt: c.netWt,
        confidence: linking.confidence,
        reason: reason.trim() || undefined,
      }),
    );
    setLinking(null);
    setReason("");
    setIdx(0);
  };

  const doReject = (c: Candidate) => {
    if (!orphan) return;
    setRejected((s) => new Set(s).add(c.key));
    run(() => rejectCandidate({ saleId: orphan.dispatchId ?? saleId, lotId: orphan.lotId, invoiceNo: orphan.invoiceNo, candidateLotNo: c.lotNo }));
  };

  const outcome = (fn: typeof markShutout, label: string) => {
    if (!orphan) return;
    run(() => fn({ saleId: orphan.dispatchId ?? saleId, lotId: orphan.lotId, invoiceNo: orphan.invoiceNo, orphanGrade: orphan.grade, orphanNetWt: orphan.netWt }));
    setIdx(0);
  };

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/60">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-sm text-stone-600 dark:text-stone-300">
          <span className="font-medium">Compare &amp; resolve</span>{" "}
          <span className="text-stone-400 dark:text-stone-500">
            · {orphans.length} unresolved · {candidates.length} unexpected lot{candidates.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          {open ? "Hide" : "Compare"}
        </button>
      </div>

      {open && orphan && (
        <div className={`space-y-4 border-t border-stone-200 dark:border-stone-700 p-4 ${isPending ? "opacity-60" : ""}`}>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Pick the acknowledged lot an invoiced-but-unacknowledged lot really is, or record that it has no match. Nothing
            is auto-linked — every decision is yours and is logged.
          </p>

          {/* Orphan selector */}
          {orphans.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {orphans.map((o, i) => (
                <button
                  key={o.lotId}
                  onClick={() => setIdx(i)}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    i === idx
                      ? "bg-green-700 dark:bg-green-600 text-white"
                      : "border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  inv {o.invoiceNo}
                </button>
              ))}
            </div>
          )}

          {/* Orphan card */}
          <div className="rounded-lg border border-amber-300/60 dark:border-amber-600/30 bg-amber-50 dark:bg-amber-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                  Invoice {orphan.invoiceNo}
                  <span className="rounded-full bg-amber-200/70 dark:bg-amber-900 px-2 py-0.5 text-amber-800 dark:text-amber-300">
                    unacknowledged
                  </span>
                </div>
                <div className="text-base font-semibold text-stone-800 dark:text-stone-100">
                  {orphan.grade} · {orphan.netWt.toFixed(2)} kg
                </div>
              </div>
              <div className="text-right text-xs text-stone-500 dark:text-stone-400">
                <div>mark {orphan.markCode ?? "—"}</div>
                <div>catalogued lot: none</div>
              </div>
            </div>
          </div>

          {/* Confidence control */}
          <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            Min confidence
            <input
              type="range" min="0" max="1" step="0.05" value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className="accent-green-600"
            />
            <span className="w-8 font-mono text-stone-600 dark:text-stone-300">{Math.round(minConfidence * 100)}%</span>
            <span className="ml-auto">{visible.length} of {ranked.length} shown</span>
          </label>

          {/* Candidate cards */}
          <div className="space-y-2">
            {visible.map((r) => {
              const b = band(r.confidence);
              const delta = r.candidate.netWt - orphan.netWt;
              return (
                <div key={r.candidate.key} className={`rounded-lg border ${b.ring} bg-white dark:bg-stone-900 p-3`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500 dark:text-stone-400">lot {r.candidate.lotNo ?? "—"}</span>
                        <span className="rounded-full bg-purple-100 dark:bg-purple-900 px-2 py-0.5 text-xs text-purple-800 dark:text-purple-300">
                          unexpected
                        </span>
                        <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                          {r.candidate.grade} · {r.candidate.netWt.toFixed(2)} kg
                        </span>
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
                  <div className="mt-2 flex items-center gap-2 border-t border-stone-100 dark:border-stone-800 pt-2">
                    <button
                      disabled={isPending}
                      onClick={() => setLinking({ candidate: r.candidate, confidence: r.confidence, delta })}
                      className="rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 dark:hover:bg-green-700 disabled:opacity-50"
                    >
                      Link to invoice {orphan.invoiceNo}
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => doReject(r.candidate)}
                      className="rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 p-6 text-center text-xs text-stone-500 dark:text-stone-400">
                No candidates above {Math.round(minConfidence * 100)}%. Lower the threshold, or record an outcome below.
              </div>
            )}
          </div>

          {/* Orphan-level outcomes */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3">
            <div className="mb-2 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">No lot fits?</div>
            <div className="flex flex-wrap gap-2">
              <button disabled={isPending} onClick={() => outcome(markShutout, "shutout")}
                className="rounded-md border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50">
                Mark as shut out
              </button>
              <button disabled={isPending} onClick={() => outcome(markMissing, "missing")}
                className="rounded-md border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 disabled:opacity-50">
                Mark as genuinely missing
              </button>
              <button disabled={isPending} onClick={() => outcome(markPending, "pending")}
                className="rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50">
                Leave unresolved
              </button>
            </div>
          </div>

          {/* Audit trail */}
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-stone-400 dark:text-stone-500">Audit trail</div>
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
              {audit.length === 0 ? (
                <div className="p-3 text-xs text-stone-400 dark:text-stone-500">No decisions recorded yet.</div>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {audit.map((a, i) => (
                    <li key={i} className="px-3 py-2 text-xs">
                      <span className="font-medium text-stone-700 dark:text-stone-200">{a.action}</span>
                      <span className="text-stone-500 dark:text-stone-400"> · {a.detail}</span>
                      {a.confidenceShown != null && (
                        <span className="text-stone-400 dark:text-stone-500"> · shown {Math.round(a.confidenceShown * 100)}%</span>
                      )}
                      {a.reason && <div className="text-stone-400 dark:text-stone-500">reason: {a.reason}</div>}
                      <div className="text-stone-400 dark:text-stone-500">
                        by {a.actor} · {new Date(a.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Link confirmation dialog */}
      {linking && orphan && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5">
            <h3 className="text-base font-semibold text-stone-800 dark:text-stone-100">Confirm link</h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Link invoice <span className="font-mono">{orphan.invoiceNo}</span> ({orphan.grade} ·{" "}
              {orphan.netWt.toFixed(2)} kg) to lot <span className="font-mono">{linking.candidate.lotNo ?? "—"}</span>{" "}
              ({linking.candidate.grade} · {linking.candidate.netWt.toFixed(2)} kg)?
            </p>
            {linking.delta !== 0 && (
              <div className="mt-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                Weights differ by {linking.delta > 0 ? "+" : "−"}{Math.abs(linking.delta).toFixed(2)} kg. The link is
                allowed, but the difference is filed as a weight mismatch in the audit trail so it isn&apos;t lost.
              </div>
            )}
            <label className="mt-3 block text-xs text-stone-500 dark:text-stone-400">Reason (optional, kept in the audit trail)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. confirmed with broker — same chest, re-weighed at warehouse"
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
