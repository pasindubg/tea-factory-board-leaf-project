"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TabView } from "@tea/ui";
import { rankSettlements, matchBand, type UnpaidSettlement, type UnattributedCredit } from "@tea/api";
import { showAppToast } from "@/components/action-feedback";
import { EntityList, type EntityListContext } from "@/components/entity-list";
import {
  ListCommandToolbar,
  ListSearchPanel,
  ListSurface,
  SortButton,
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
import { linkBankCredit } from "../../../actions";

// Bank resolver (#20): unattributed credits and their ranked settlement matches
// are ordinary framework lists. Matching remains a deliberate human-confirmed
// workflow transition and every decision is recorded in the audit list.

export type ResolverCredit = { txnId: string; txnDate: string; credit: number; description: string };
export type ResolverSettlement = UnpaidSettlement;
export type AuditRow = WorkflowAuditRow;

type RankedSettlement = ReturnType<typeof rankSettlements>[number];

const CREDIT_COLUMNS: ColumnDef<ResolverCredit>[] = [
  { key: "txnDate", label: "Credit date", accessor: (row) => row.txnDate, sortable: true, searchInput: "date" },
  { key: "credit", label: "Credit", accessor: (row) => row.credit, sortable: true, lov: false, searchInput: "number" },
  { key: "description", label: "Narration", accessor: (row) => row.description, sortable: true, filter: "text", lov: false },
];

const SETTLEMENT_COLUMNS: ColumnDef<RankedSettlement>[] = [
  { key: "contractNo", label: "Contract", accessor: (row) => row.settlement.contractNo, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (row) => row.settlement.brokerName ?? null, sortable: true, filter: "select" },
  { key: "total", label: "Expected total", accessor: (row) => row.settlement.totalNetProceeds, sortable: true, lov: false, searchInput: "number" },
  { key: "cashOnly", label: "Cash-only target", accessor: (row) => row.settlement.cashOnly, sortable: true, lov: false, searchInput: "number" },
  { key: "promptDate", label: "Prompt date", accessor: (row) => row.settlement.promptDate, sortable: true, searchInput: "date" },
  { key: "confidence", label: "Confidence", accessor: (row) => Math.round(row.confidence * 100), sortable: true, lov: false, searchInput: "number" },
  { key: "signals", label: "Match signals", accessor: (row) => row.dims.map((dimension) => `${dimension.label}: ${dimension.detail}`).join("; "), filter: "text", lov: false },
];

const CREDIT_LIST: ListDefinition<ResolverCredit> = {
  columns: CREDIT_COLUMNS,
  selectionMode: "single",
  commands: [{ id: "review", label: "Review matches", requiresSelection: true }],
};

const SETTLEMENT_LIST: ListDefinition<RankedSettlement> = {
  columns: SETTLEMENT_COLUMNS,
  selectionMode: "single",
  commands: [{ id: "link", label: "Link selected settlement", requiresSelection: true }],
};

const toneText: Record<string, string> = {
  good: "text-green-700 dark:text-green-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-stone-500 dark:text-stone-400",
};

const LKR = (value: number) => `Rs ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  if (credits.length === 0 || settlements.length === 0) return null;

  return (
    <EntityList
      scope="bank-credit-resolver"
      initialRows={credits}
      definition={CREDIT_LIST}
      getId={(row) => row.txnId}
      rowLabel={(row) => `${LKR(row.credit)} credit on ${row.txnDate}`}
      emptyMessage="No unattributed credits."
      renderMode="workflow"
      render={(list) => (
        <BankResolverWorkflow
          saleId={saleId}
          importId={importId}
          settlements={settlements}
          audit={audit}
          list={list}
        />
      )}
    />
  );
}

function BankResolverWorkflow({
  saleId,
  importId,
  settlements,
  audit,
  list,
}: {
  saleId: string;
  importId: string;
  settlements: ResolverSettlement[];
  audit: AuditRow[];
  list: EntityListContext<ResolverCredit>;
}) {
  const [activeTab, setActiveTab] = useState("credits");
  const [linking, setLinking] = useState<{ credit: ResolverCredit; match: RankedSettlement } | null>(null);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { rows: credits, controls: creditControls, selection: creditSelection } = list;
  const selectCredit = creditSelection.select;

  useEffect(() => {
    if (!creditSelection.selectedId && credits[0]) selectCredit(credits[0].txnId);
  }, [creditSelection.selectedId, credits, selectCredit]);

  const credit = credits.find((row) => row.txnId === creditSelection.selectedId) ?? credits[0];
  const ranked = useMemo(() => {
    if (!credit) return [];
    const source: UnattributedCredit = {
      txnId: credit.txnId,
      txnDate: credit.txnDate,
      credit: credit.credit,
      description: credit.description,
    };
    return rankSettlements(source, settlements);
  }, [credit, settlements]);

  function confirmLink() {
    if (!linking) return;
    const pendingLink = linking;
    startTransition(async () => {
      try {
        const result: ListMutationResult = await linkBankCredit({
          saleId,
          importId,
          txnId: pendingLink.credit.txnId,
          settlementId: pendingLink.match.settlement.settlementId,
          confidence: pendingLink.match.confidence,
          reason: reason.trim() || undefined,
        });
        if (!result.ok) {
          showAppToast(result.error, "error");
          return;
        }
        setLinking(null);
        setReason("");
        setActiveTab("credits");
        showAppToast(result.notice ?? "Bank credit linked.");
        router.refresh();
      } catch {
        showAppToast("The bank credit could not be linked. Please try again.", "error");
      }
    });
  }

  return (
    <section className={`space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900/60 ${isPending ? "opacity-60" : ""}`} aria-busy={isPending}>
      <header>
        <h3 className="text-sm font-medium text-stone-700 dark:text-stone-200">Resolve unattributed credits</h3>
        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
          Select a credit, review ranked settlements, and confirm the link. Nothing is linked automatically.
        </p>
      </header>

      <TabView
        label="Bank reconciliation lists"
        activeTabId={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          {
            id: "credits",
            label: "Unattributed credits",
            badge: credits.length,
            content: (
              <ListSurface title="Unattributed credits" description="Select the bank credit you want to resolve.">
                <ListCommandToolbar mode={CREDIT_LIST.selectionMode ?? "single"} count={creditSelection.selectedCount}>
                  <AppButton
                    type="button"
                    size="sm"
                    className="min-h-10 rounded-full px-4"
                    disabled={!creditSelection.selectedId || isPending}
                    onClick={() => setActiveTab("candidates")}
                  >
                    Review matches
                  </AppButton>
                </ListCommandToolbar>
                <ListSearchPanel columns={CREDIT_LIST.columns} controls={creditControls} />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                        {CREDIT_LIST.columns.map((column) => (
                          <th key={column.key} className={`px-4 py-3 ${column.key === "credit" ? "text-right" : ""}`}>
                            {column.sortable ? <SortButton col={column} controls={creditControls} /> : column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {creditControls.rows.map((row) => (
                        <tr
                          key={row.txnId}
                          {...creditSelection.rowProps(row.txnId, isPending)}
                          className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${creditSelection.isSelected(row.txnId) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                        >
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">{row.txnDate}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{LKR(row.credit)}</td>
                          <td className="min-w-72 px-4 py-3 text-stone-500 dark:text-stone-400">{row.description || "—"}</td>
                        </tr>
                      ))}
                      {creditControls.rows.length === 0 && credits.length > 0 && (
                        <tr><td colSpan={3} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No credits match the current search.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </ListSurface>
            ),
          },
          {
            id: "candidates",
            label: "Settlement candidates",
            badge: ranked.length,
            content: (
              <SettlementCandidateList
                key={credit.txnId}
                credit={credit}
                rows={ranked}
                busy={isPending}
                onLink={(match) => setLinking({ credit, match })}
              />
            ),
          },
          {
            id: "audit",
            label: "Audit trail",
            badge: audit.length,
            content: <WorkflowAuditList rows={audit} title="Bank decision audit" description="Search the recorded bank matching decisions and the confidence shown to the operator." />,
          },
        ]}
      />

      {linking && (
        <WorkflowDecisionDialog
          open
          title="Confirm bank link"
          description={<>Link the {LKR(linking.credit.credit)} credit on {linking.credit.txnDate} to settlement <span className="font-mono">{linking.match.settlement.contractNo}</span> (expected {LKR(linking.match.settlement.totalNetProceeds)})?</>}
          reason={reason}
          reasonPlaceholder="e.g. broker confirmed this transfer covers contract 0110"
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

function SettlementCandidateList({
  credit,
  rows,
  busy,
  onLink,
}: {
  credit: ResolverCredit;
  rows: RankedSettlement[];
  busy: boolean;
  onLink: (match: RankedSettlement) => void;
}) {
  return (
    <EntityList
      scope={`bank-settlement-candidates-${credit.txnId}`}
      initialRows={rows}
      definition={SETTLEMENT_LIST}
      getId={(row) => row.settlement.settlementId}
      rowLabel={(row) => `Settlement ${row.settlement.contractNo}`}
      emptyMessage="No unpaid settlement candidates are available."
      renderMode="workflow"
      render={({ controls, selection }) => {
        const selected = rows.find((row) => row.settlement.settlementId === selection.selectedId);
        return (
          <ListSurface
            title="Settlement candidates"
            description={`Ranked matches for the ${LKR(credit.credit)} credit dated ${credit.txnDate}. Select one settlement before linking.`}
          >
            <ListCommandToolbar mode={SETTLEMENT_LIST.selectionMode ?? "single"} count={selection.selectedCount}>
              <AppButton
                type="button"
                variant="primary"
                size="sm"
                className="min-h-10 rounded-full px-4"
                disabled={!selected || busy}
                onClick={() => selected && onLink(selected)}
              >
                Link selected settlement
              </AppButton>
            </ListCommandToolbar>
            <ListSearchPanel columns={SETTLEMENT_LIST.columns} controls={controls} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                    {SETTLEMENT_LIST.columns.map((column) => (
                      <th key={column.key} className={`px-4 py-3 ${["total", "cashOnly", "confidence"].includes(column.key) ? "text-right" : ""}`}>
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
                        key={row.settlement.settlementId}
                        {...selection.rowProps(row.settlement.settlementId, busy)}
                        className={`cursor-pointer border-b border-stone-100 align-top last:border-0 dark:border-stone-800 ${selection.isSelected(row.settlement.settlementId) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono font-medium">{row.settlement.contractNo}</td>
                        <td className="whitespace-nowrap px-4 py-3">{row.settlement.brokerName ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{LKR(row.settlement.totalNetProceeds)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{LKR(row.settlement.cashOnly)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">{row.settlement.promptDate || "—"}</td>
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
                  {controls.rows.length === 0 && rows.length > 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No settlement candidates match the current search.</td></tr>
                  )}
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">No unpaid settlement candidates are available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ListSurface>
        );
      }}
    />
  );
}
