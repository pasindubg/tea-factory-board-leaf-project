"use client";

import { useActionState, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { EntityList, type EntityListContext } from "@/components/entity-list";
import { ListSearchPanel, ListSurface, SortButton, type ColumnDef, type ListDefinition } from "@/components/list-controls";
import { SubmitButton } from "@/components/submit-button";
import { AppButton } from "@/components/ui/button";
import { AppDrawer } from "@/components/ui/drawer";
import { showAppToast } from "@/components/action-feedback";
import { ingestAcknowledgement, ingestContract, ingestValuation } from "../../actions";

export type SalesReconciliationGroup = {
  saleId: string;
  broker: string;
  dispatchNos: string[];
  lotCount: number;
  /** Dispatch invoice reached "catalogued" — the ack covers the whole group. */
  ackDone: boolean;
  /** Any lot moved to valued/sold. */
  valuationDone: boolean;
  soldDone: boolean;
  /** Documents this broker has CONFIRMED for the sale — later ones lock earlier. */
  valuationConfirmed: boolean;
  contractConfirmed: boolean;
  stageLabel: string;
};

type DocTypeKey = "ack" | "valuation" | "contract";

type DocTypeRow = {
  key: DocTypeKey;
  title: string;
  accept: string;
  pendingText: string;
  action: (saleId: string, formData: FormData) => Promise<{ error: string } | undefined>;
  unlocked: boolean;
  statusLabel: string;
};

// A broker uploads one acknowledgement, valuation, and sellers contract per
// sale — each one only makes sense once the previous reconciliation step has
// actually happened, so valuation/contract stay locked until then.
function docTypesFor(group: SalesReconciliationGroup): DocTypeRow[] {
  const { ackDone, valuationDone, valuationConfirmed, contractConfirmed } = group;
  // Superseded by a later confirmed document: uploading it again would reopen a
  // reconciliation that document has already settled. Mirrors the same rule the
  // ingest actions enforce (documentOrderBlockedReason).
  const supersededBy = (later: boolean, label: string) =>
    later ? `Superseded — the ${label} is already confirmed` : null;
  const ackSuperseded = supersededBy(contractConfirmed, "sellers contract") ?? supersededBy(valuationConfirmed, "valuation");
  const valuationSuperseded = supersededBy(contractConfirmed, "sellers contract");
  return [
    {
      key: "ack",
      title: "Acknowledgement",
      accept: "application/pdf",
      pendingText: "Reading…",
      action: ingestAcknowledgement,
      unlocked: !ackSuperseded,
      statusLabel: ackSuperseded ?? "Available",
    },
    {
      key: "valuation",
      title: "Valuation",
      accept: "application/pdf",
      pendingText: "Reading…",
      action: ingestValuation,
      unlocked: ackDone && !valuationSuperseded,
      statusLabel: valuationSuperseded ?? (ackDone ? "Available" : "Requires the acknowledgement to be confirmed first"),
    },
    {
      key: "contract",
      title: "Sellers contract",
      accept: "application/pdf",
      pendingText: "Reading…",
      action: ingestContract,
      unlocked: valuationDone,
      statusLabel: valuationDone ? "Available" : "Requires the valuation to be confirmed first",
    },
  ];
}

const BROKER_COLUMNS: ColumnDef<SalesReconciliationGroup>[] = [
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "text" },
  { key: "dispatchNos", label: "Dispatch invoices", accessor: (row) => row.dispatchNos.join(", ") || null, sortable: true, filter: "text" },
  { key: "lotCount", label: "Lots", accessor: (row) => row.lotCount, sortable: true, lov: false, searchInput: "number" },
  { key: "stageLabel", label: "Stage", accessor: (row) => row.stageLabel, sortable: true, filter: "select" },
];

const DOC_TYPE_COLUMNS: ColumnDef<DocTypeRow>[] = [
  { key: "title", label: "Document type", accessor: (row) => row.title, sortable: true, filter: "select" },
  { key: "statusLabel", label: "Status", accessor: (row) => row.statusLabel, sortable: true, filter: "select" },
];

const BROKER_LIST: ListDefinition<SalesReconciliationGroup> = { columns: BROKER_COLUMNS, selectionMode: "single" };

export function SalesReconciliationAssistant({
  saleNo,
  groups,
}: {
  saleNo: string;
  groups: SalesReconciliationGroup[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AppButton
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="rounded-full"
      >
        <FileText aria-hidden="true" className="h-4 w-4" />
        Document reconciliation
      </AppButton>

      <AppDrawer open={open} title="Document reconciliation" description={`Sale ${saleNo} · ${groups.length} broker${groups.length === 1 ? "" : "s"}`} onClose={() => setOpen(false)}>
        <EntityList
          scope="reconciliation-brokers"
          initialRows={groups}
          definition={BROKER_LIST}
          getId={(row) => row.saleId}
          rowLabel={(row) => row.broker}
          emptyMessage="No brokers for this sale."
          renderMode="workflow"
          render={(list) => <BrokerWorkflow list={list} />}
        />
      </AppDrawer>
    </>
  );
}

function BrokerWorkflow({ list }: { list: EntityListContext<SalesReconciliationGroup> }) {
  const { rows: groups, controls, selection } = list;
  const group = groups.find((row) => row.saleId === selection.selectedId);

  return (
    <div className="space-y-4">
      <ListSurface title="Brokers" description="Select a broker to review its document uploads.">
        <ListSearchPanel columns={BROKER_LIST.columns} controls={controls} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
                {BROKER_LIST.columns.map((column) => (
                  <th key={column.key} className={`px-4 py-3 ${column.key === "lotCount" ? "text-right" : ""}`}>
                    {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {controls.rows.map((row) => (
                <tr
                  key={row.saleId}
                  {...selection.rowProps(row.saleId)}
                  className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(row.saleId) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{row.broker}</td>
                  <td className="px-4 py-3 text-stone-500 dark:text-stone-400">{row.dispatchNos.join(", ") || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{row.lotCount}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.stageLabel}</td>
                </tr>
              ))}
              {controls.rows.length === 0 && groups.length > 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                    No brokers match the current search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ListSurface>

      {group && (
        <EntityList
          key={group.saleId}
          scope={`reconciliation-doctypes-${group.saleId}`}
          initialRows={docTypesFor(group)}
          definition={{ columns: DOC_TYPE_COLUMNS, selectionMode: "single" }}
          getId={(row) => row.key}
          rowLabel={(row) => row.title}
          emptyMessage="No document types."
          renderMode="workflow"
          render={(docList) => <DocTypeWorkflow saleId={group.saleId} broker={group.broker} list={docList} />}
        />
      )}
    </div>
  );
}

function DocTypeWorkflow({
  saleId,
  broker,
  list,
}: {
  saleId: string;
  broker: string;
  list: EntityListContext<DocTypeRow>;
}) {
  const { rows, controls, selection } = list;
  const selected = rows.find((row) => row.key === selection.selectedId);
  const inputId = `doc-upload-${saleId}-${selected?.key ?? "none"}`;

  return (
    <ListSurface
      title="Document types"
      description={`${broker} — select a document type to upload it.`}
      actions={
        selected && selected.unlocked ? (
          <UploadForm key={selected.key} saleId={saleId} doc={selected} inputId={inputId} />
        ) : undefined
      }
    >
      <ListSearchPanel columns={DOC_TYPE_COLUMNS} controls={controls} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {DOC_TYPE_COLUMNS.map((column) => (
                <th key={column.key} className="px-4 py-3">
                  {column.sortable ? <SortButton col={column} controls={controls} /> : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {controls.rows.map((row) => (
              <tr
                key={row.key}
                {...selection.rowProps(row.key)}
                className={`cursor-pointer border-b border-stone-100 last:border-0 dark:border-stone-800 ${selection.isSelected(row.key) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-3 font-medium">{row.title}</td>
                <td className={`px-4 py-3 ${row.unlocked ? "text-stone-500 dark:text-stone-400" : "text-amber-700 dark:text-amber-400"}`}>{row.statusLabel}</td>
              </tr>
            ))}
            {controls.rows.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-stone-400 dark:text-stone-500">
                  No document types match the current search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ListSurface>
  );
}

function UploadForm({ saleId, doc, inputId }: { saleId: string; doc: DocTypeRow; inputId: string }) {
  const [, formAction] = useActionState(async (_previous: string | null, formData: FormData) => {
    try {
      const result = await doc.action(saleId, formData);
      if (!result?.error) return null;
      showAppToast(result.error, "error");
      return result.error;
    } catch (thrown) {
      if ((thrown as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw thrown;
      const message = thrown instanceof Error ? thrown.message : "The document could not be read.";
      showAppToast(message, "error");
      return message;
    }
  }, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input id={inputId} type="file" name="file" accept={doc.accept} required className="peer sr-only" />
      <label
        htmlFor={inputId}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-green-50 hover:text-green-800 hover:border-green-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-green-950 dark:hover:text-green-300 dark:hover:border-green-700"
      >
        <Upload aria-hidden="true" className="h-3.5 w-3.5" />
        Choose file
      </label>
      <SubmitButton pendingText={doc.pendingText} variant="primary" className="h-9 rounded-full px-4 text-xs">
        Upload
      </SubmitButton>
    </form>
  );
}
