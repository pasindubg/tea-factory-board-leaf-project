"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TabView } from "@tea/ui";
import { rankCandidates, matchBand, type OrphanLot, type CandidateLot } from "@tea/api";
import { showAppToast } from "@/components/action-feedback";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSurface,
  SortButton,
  useListControls,
  useListSelection,
  type ColumnDef,
  type ListDefinition,
} from "@/components/list-controls";
import { AppButton } from "@/components/ui/button";
import type { ListMutationResult } from "@/lib/list-mutations";
import {
  WorkflowAuditList,
  type WorkflowAuditRow,
} from "@/app/dashboard/auction/_components/workflow-audit-list";
import { WorkflowDecisionDialog } from "@/app/dashboard/auction/_components/workflow-decision-dialog";
import {
  linkOrphanLot,
  markShutout,
  markMissing,
  markPending,
  rejectCandidate,
} from "../../../actions";

// Reconciliation ① resolver. Unresolved invoices, candidate catalogue lots,
// and their decision history are shared framework lists. All mutations remain
// explicit workflow transitions and are triggered from selection toolbars.

export type Orphan = { lotId: string; dispatchId?: string; invoiceNo: string; grade: string; netWt: number; markCode: string | null };
export type Candidate = { key: string; lotNo: string | null; grade: string; netWt: number; markCode: string | null };
export type AuditRow = WorkflowAuditRow;

type RankedCandidate = ReturnType<typeof rankCandidates>[number] & { delta: number };
type Outcome = "shutout" | "missing" | "pending";

const ORPHAN_COLUMNS: ColumnDef<Orphan>[] = [
  { key: "invoiceNo", label: "Invoice", accessor: (row) => row.invoiceNo, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (row) => row.grade, sortable: true, filter: "select" },
  { key: "netWt", label: "Net weight", accessor: (row) => row.netWt, sortable: true, lov: false, searchInput: "number" },
  { key: "markCode", label: "Mark", accessor: (row) => row.markCode, sortable: true, filter: "select" },
];

const CANDIDATE_COLUMNS: ColumnDef<RankedCandidate>[] = [
  { key: "lotNo", label: "Catalogue lot", accessor: (row) => row.candidate.lotNo, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (row) => row.candidate.grade, sortable: true, filter: "select" },
  { key: "netWt", label: "Net weight", accessor: (row) => row.candidate.netWt, sortable: true, lov: false, searchInput: "number" },
  { key: "markCode", label: "Mark", accessor: (row) => row.candidate.markCode, sortable: true, filter: "select" },
  { key: "delta", label: "Weight difference", accessor: (row) => row.delta, sortable: true, lov: false, searchInput: "number" },
  { key: "confidence", label: "Confidence", accessor: (row) => Math.round(row.confidence * 100), sortable: true, lov: false, searchInput: "number" },
  { key: "signals", label: "Match signals", accessor: (row) => row.dims.map((dimension) => `${dimension.label}: ${dimension.detail}`).join("; "), filter: "text", lov: false },
];

const ORPHAN_LIST: ListDefinition<Orphan> = {
  columns: ORPHAN_COLUMNS,
  selectionMode: "single",
  commands: [
    { id: "review", label: "Review candidates", requiresSelection: true },
    { id: "shutout", label: "Mark shut out", requiresSelection: true, destructive: true },
    { id: "missing", label: "Mark missing", requiresSelection: true },
    { id: "pending", label: "Leave unresolved", requiresSelection: true },
  ],
};

const CANDIDATE_LIST: ListDefinition<RankedCandidate> = {
  columns: CANDIDATE_COLUMNS,
  selectionMode: "single",
  commands: [
    { id: "link", label: "Link selected lot", requiresSelection: true },
    { id: "reject", label: "Reject candidate", requiresSelection: true, destructive: true },
  ],
};

const OUTCOME_ACTIONS: Record<Outcome, typeof markShutout> = {
  shutout: markShutout,
  missing: markMissing,
  pending: markPending,
};

const OUTCOME_COPY: Record<Outcome, { title: string; description: string; confirm: string; notice: string }> = {
  shutout: {
    title: "Mark invoice as shut out?",
    description: "The selected invoice will leave the unresolved queue and be recorded as shut out in the audit trail.",
    confirm: "Mark shut out",
    notice: "Invoice marked as shut out.",
  },
  missing: {
    title: "Mark invoice as missing?",
    description: "The selected invoice will leave the unresolved queue and be recorded as genuinely missing.",
    confirm: "Mark missing",
    notice: "Invoice marked as missing.",
  },
  pending: {
    title: "Leave invoice unresolved?",
    description: "The selected invoice will remain pending and the decision will be written to the audit trail.",
    confirm: "Leave unresolved",
    notice: "Invoice left unresolved.",
  },
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
  const [activeTab, setActiveTab] = useState("orphans");
  const [confirmingOutcome, setConfirmingOutcome] = useState<Outcome | null>(null);
  const [linking, setLinking] = useState<{ orphan: Orphan; match: RankedCandidate } | null>(null);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const orphanControls = useListControls(orphans, ORPHAN_LIST.columns);
  const orphanSelection = useListSelection(orphans, {
    mode: ORPHAN_LIST.selectionMode ?? "single",
    getId: (row) => row.lotId,
  });
  const selectOrphan = orphanSelection.select;

  useEffect(() => {
    if (!orphanSelection.selectedId && orphans[0]) selectOrphan(orphans[0].lotId);
  }, [orphanSelection.selectedId, orphans, selectOrphan]);

  const orphan = orphans.find((row) => row.lotId === orphanSelection.selectedId) ?? orphans[0];
  const ranked = useMemo<RankedCandidate[]>(() => {
    if (!orphan) return [];
    const source: OrphanLot = {
      invoiceNo: orphan.invoiceNo,
      grade: orphan.grade,
      netWt: orphan.netWt,
      markCode: orphan.markCode,
    };
    const pool: CandidateLot[] = candidates.map((candidate) => ({
      key: candidate.key,
      lotNo: candidate.lotNo,
      grade: candidate.grade,
      netWt: candidate.netWt,
      markCode: candidate.markCode,
    }));
    return rankCandidates(source, pool).map((match) => ({
      ...match,
      delta: Number((match.candidate.netWt - orphan.netWt).toFixed(2)),
    }));
  }, [candidates, orphan]);

  if (orphans.length === 0) return null;

  function runWorkflow(action: () => Promise<ListMutationResult>, notice: string, onSuccess?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          showAppToast(result.error, "error");
          return;
        }
        onSuccess?.();
        showAppToast(result.notice ?? notice);
        router.refresh();
      } catch {
        showAppToast("The reconciliation decision could not be saved. Please try again.", "error");
      }
    });
  }

  function confirmLink() {
    if (!linking) return;
    const pendingLink = linking;
    runWorkflow(
      () => linkOrphanLot({
        saleId: pendingLink.orphan.dispatchId ?? saleId,
        lotId: pendingLink.orphan.lotId,
        candidateLotNo: pendingLink.match.candidate.lotNo,
        candidateMarkCode: pendingLink.match.candidate.markCode,
        candidateNetWt: pendingLink.match.candidate.netWt,
        confidence: pendingLink.match.confidence,
        reason: reason.trim() || undefined,
      }),
      "Invoice and catalogue lot linked.",
      () => {
        setLinking(null);
        setReason("");
        setActiveTab("orphans");
      },
    );
  }

  function confirmOutcome() {
    if (!confirmingOutcome || !orphan) return;
    const outcome = confirmingOutcome;
    const copy = OUTCOME_COPY[outcome];
    runWorkflow(
      () => OUTCOME_ACTIONS[outcome]({
        saleId: orphan.dispatchId ?? saleId,
        lotId: orphan.lotId,
      }),
      copy.notice,
      () => setConfirmingOutcome(null),
    );
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/60">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm text-stone-600 dark:text-stone-300">
          <span className="font-medium">Compare &amp; resolve</span>{" "}
          <span className="text-stone-400 dark:text-stone-500">· {orphans.length} unresolved · {candidates.length} unexpected lot{candidates.length === 1 ? "" : "s"}</span>
        </div>
        <AppButton type="button" variant="primary" size="sm" onClick={() => setOpen((current) => !current)}>{open ? "Hide" : "Compare"}</AppButton>
      </header>

      {open && orphan && (
        <div className={`space-y-4 border-t border-stone-200 p-4 dark:border-stone-700 ${isPending ? "opacity-60" : ""}`} aria-busy={isPending}>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Select an unresolved invoice, then link the correct acknowledged lot or record a no-match outcome. Every decision is logged.
          </p>
          <TabView
            label="Acknowledgement reconciliation lists"
            activeTabId={activeTab}
            onTabChange={setActiveTab}
            tabs={[
              {
                id: "orphans",
                label: "Unresolved invoices",
                badge: orphans.length,
                content: (
                  <ListSurface title="Unresolved invoices" description="Select the invoiced lot whose acknowledgement outcome you want to resolve.">
                    <ListCommandToolbar mode={ORPHAN_LIST.selectionMode ?? "single"} count={orphanSelection.selectedCount}>
                      <AppButton type="button" size="sm" className="min-h-10 rounded-full px-4" disabled={!orphanSelection.selectedId || isPending} onClick={() => setActiveTab("candidates")}>Review candidates</AppButton>
                      <AppButton type="button" variant="danger" size="sm" className="min-h-10 rounded-full px-4" disabled={!orphanSelection.selectedId || isPending} onClick={() => setConfirmingOutcome("shutout")}>Mark shut out</AppButton>
                      <AppButton type="button" size="sm" className="min-h-10 rounded-full px-4" disabled={!orphanSelection.selectedId || isPending} onClick={() => setConfirmingOutcome("missing")}>Mark missing</AppButton>
                      <AppButton type="button" variant="ghost" size="sm" className="min-h-10 rounded-full px-4" disabled={!orphanSelection.selectedId || isPending} onClick={() => setConfirmingOutcome("pending")}>Leave unresolved</AppButton>
                    </ListCommandToolbar>
                    <ListSearchPanel columns={ORPHAN_LIST.columns} controls={orphanControls} />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                            {ORPHAN_LIST.columns.map((column) => (
                              <th key={column.key} className={`px-4 py-3 ${column.key === "netWt" ? "text-right" : ""}`}>
                                {column.sortable ? <SortButton col={column} controls={orphanControls} /> : column.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {orphanControls.rows.map((row) => (
                            <tr
                              key={row.lotId}
                              {...orphanSelection.rowProps(row.lotId, isPending)}
                              className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${orphanSelection.isSelected(row.lotId) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                            >
                              <td className="whitespace-nowrap px-4 py-3 font-mono font-medium">{row.invoiceNo}</td>
                              <td className="px-4 py-3 font-medium">{row.grade}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{row.netWt.toFixed(2)} kg</td>
                              <td className="whitespace-nowrap px-4 py-3">{row.markCode ?? "—"}</td>
                            </tr>
                          ))}
                          {orphanControls.rows.length === 0 && orphans.length > 0 && (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No unresolved invoices match the current search.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </ListSurface>
                ),
              },
              {
                id: "candidates",
                label: "Candidate lots",
                badge: ranked.length,
                content: (
                  <CandidateList
                    key={orphan.lotId}
                    orphan={orphan}
                    rows={ranked}
                    busy={isPending}
                    onLink={(match) => setLinking({ orphan, match })}
                    onReject={(match, onSuccess) => runWorkflow(
                      () => rejectCandidate({
                        saleId: orphan.dispatchId ?? saleId,
                        lotId: orphan.lotId,
                        candidateLotNo: match.candidate.lotNo,
                      }),
                      "Candidate rejected for this invoice.",
                      onSuccess,
                    )}
                  />
                ),
              },
              {
                id: "audit",
                label: "Audit trail",
                badge: audit.length,
                content: <WorkflowAuditList rows={audit} title="Acknowledgement decision audit" description="Search links, rejected candidates, and recorded no-match outcomes." />,
              },
            ]}
          />
        </div>
      )}

      <ConfirmationDialog
        open={confirmingOutcome !== null}
        title={confirmingOutcome ? OUTCOME_COPY[confirmingOutcome].title : "Confirm outcome"}
        description={confirmingOutcome ? OUTCOME_COPY[confirmingOutcome].description : "Confirm this reconciliation outcome."}
        confirmLabel={confirmingOutcome ? OUTCOME_COPY[confirmingOutcome].confirm : "Confirm"}
        destructive={confirmingOutcome === "shutout"}
        busy={isPending}
        onCancel={() => setConfirmingOutcome(null)}
        onConfirm={confirmOutcome}
      />

      {linking && (
        <WorkflowDecisionDialog
          open
          title="Confirm link"
          description={<>Link invoice <span className="font-mono">{linking.orphan.invoiceNo}</span> ({linking.orphan.grade} · {linking.orphan.netWt.toFixed(2)} kg) to catalogue lot <span className="font-mono">{linking.match.candidate.lotNo ?? "—"}</span> ({linking.match.candidate.grade} · {linking.match.candidate.netWt.toFixed(2)} kg)?</>}
          warning={linking.match.delta !== 0 ? <>Weights differ by {linking.match.delta > 0 ? "+" : "−"}{Math.abs(linking.match.delta).toFixed(2)} kg. The difference will be kept in the audit trail.</> : undefined}
          reason={reason}
          reasonPlaceholder="e.g. confirmed with broker — same chest, re-weighed at warehouse"
          confirmLabel="Confirm link"
          busy={isPending}
          onReasonChange={setReason}
          onCancel={() => { setLinking(null); setReason(""); }}
          onConfirm={confirmLink}
        />
      )}
    </section>
  );
}

function CandidateList({
  orphan,
  rows,
  busy,
  onLink,
  onReject,
}: {
  orphan: Orphan;
  rows: RankedCandidate[];
  busy: boolean;
  onLink: (match: RankedCandidate) => void;
  onReject: (match: RankedCandidate, onSuccess: () => void) => void;
}) {
  const [minConfidence, setMinConfidence] = useState(0);
  const [rejected, setRejected] = useState<Set<string>>(() => new Set());
  const [confirmingReject, setConfirmingReject] = useState(false);
  const eligibleRows = useMemo(
    () => rows.filter((row) => !rejected.has(row.candidate.key) && row.confidence >= minConfidence),
    [minConfidence, rejected, rows],
  );
  const controls = useListControls(eligibleRows, CANDIDATE_LIST.columns);
  const selection = useListSelection(eligibleRows, {
    mode: CANDIDATE_LIST.selectionMode ?? "single",
    getId: (row) => row.candidate.key,
  });
  const selected = eligibleRows.find((row) => row.candidate.key === selection.selectedId);

  return (
    <ListSurface
      title="Candidate catalogue lots"
      description={`Ranked matches for invoice ${orphan.invoiceNo} (${orphan.grade} · ${orphan.netWt.toFixed(2)} kg).`}
    >
      <ListCommandToolbar mode={CANDIDATE_LIST.selectionMode ?? "single"} count={selection.selectedCount}>
        <label className="flex min-h-10 items-center gap-2 rounded-full border border-stone-300 bg-white px-3 text-xs font-medium text-stone-600 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300">
          Min confidence
          <input type="range" min="0" max="1" step="0.05" value={minConfidence} onChange={(event) => setMinConfidence(Number(event.target.value))} className="w-24 accent-green-600" />
          <span className="w-8 font-mono">{Math.round(minConfidence * 100)}%</span>
        </label>
        <AppButton type="button" variant="primary" size="sm" className="min-h-10 rounded-full px-4" disabled={!selected || busy} onClick={() => selected && onLink(selected)}>Link selected lot</AppButton>
        <AppButton type="button" variant="danger" size="sm" className="min-h-10 rounded-full px-4" disabled={!selected || busy} onClick={() => setConfirmingReject(true)}>Reject candidate</AppButton>
      </ListCommandToolbar>
      <ListSearchPanel columns={CANDIDATE_LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {CANDIDATE_LIST.columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 ${["netWt", "delta", "confidence"].includes(column.key) ? "text-right" : ""}`}>
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {controls.rows.map((row) => {
              const confidenceBand = matchBand(row.confidence);
              return (
                <tr
                  key={row.candidate.key}
                  {...selection.rowProps(row.candidate.key, busy)}
                  className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(row.candidate.key) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-medium">{row.candidate.lotNo ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{row.candidate.grade}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{row.candidate.netWt.toFixed(2)} kg</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.candidate.markCode ?? "—"}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${row.delta === 0 ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {row.delta === 0 ? "Exact" : `${row.delta > 0 ? "+" : "−"}${Math.abs(row.delta).toFixed(2)} kg`}
                  </td>
                  <td className="min-w-36 px-4 py-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={confidenceBand === "high" ? "text-green-700 dark:text-green-400" : confidenceBand === "medium" ? "text-amber-700 dark:text-amber-400" : "text-stone-500 dark:text-stone-400"}>{confidenceBand}</span>
                      <span className="font-mono">{Math.round(row.confidence * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                      <div className={confidenceBand === "high" ? "h-full bg-green-600" : confidenceBand === "medium" ? "h-full bg-amber-500" : "h-full bg-stone-400"} style={{ width: `${Math.round(row.confidence * 100)}%` }} />
                    </div>
                  </td>
                  <td className="min-w-80 px-4 py-3 text-xs">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {row.dims.map((dimension) => (
                        <span key={dimension.key} className={toneText[dimension.tone]}>{dimension.label}: {dimension.detail}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {controls.rows.length === 0 && eligibleRows.length > 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No candidate lots match the current search.</td></tr>
            )}
            {eligibleRows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No candidates are available above {Math.round(minConfidence * 100)}% confidence.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmationDialog
        open={confirmingReject}
        title="Reject selected candidate?"
        description={`The selected catalogue lot will be excluded as a match for invoice ${orphan.invoiceNo}, and the rejection will be recorded in the audit trail.`}
        confirmLabel="Reject candidate"
        destructive
        busy={busy}
        onCancel={() => setConfirmingReject(false)}
        onConfirm={() => {
          if (!selected) return;
          const rejectedKey = selected.candidate.key;
          onReject(selected, () => {
            setRejected((current) => new Set(current).add(rejectedKey));
            selection.clear();
            setConfirmingReject(false);
          });
        }}
      />
    </ListSurface>
  );
}
