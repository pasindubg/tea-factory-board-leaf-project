"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EntityList, EntityListTabs, type EntityListColumn, type EntityListCommand } from "@/components/entity-list";
import { enumFilterOptions, type ListDefinition } from "@/components/list-controls";
import { LovCombobox } from "@/components/lov-combobox";
import { showAppToast } from "@/components/action-feedback";
import { AppButton } from "@/components/ui/button";
import { AppDrawer } from "@/components/ui/drawer";
import type { AuctionInvoiceOverviewListRow } from "@/lib/list-resources";
import { moveLotsToBroker } from "../actions";
import { InvoiceOverviewTable } from "../invoices/invoice-overview-table";
import type { GradeOption, NewInvoiceDefaults } from "../invoices/new-invoice-row";
import { BROKER_INVOICE_STATUSES } from "../state-buckets";

type InvoiceOverviewRow = AuctionInvoiceOverviewListRow;

export type DispatchLotRow = {
  id: string;
  invoiceNo: string;
  brokerInvoiceNo: string;
  broker: string;
  mark: string;
  lotNo: string;
  grade: string;
  bags: number | null;
  netWt: string | number | null;
  state: string;
};

export type DispatchInvoiceRow = {
  id: string;
  invoiceNo: string;
  broker: string;
  sellingMark: string;
  invoiceDate: string | null;
  saleDate: string | null;
  lotsCount: number;
  netWt: number;
  status: string;
};

const INVOICE_COLUMNS: EntityListColumn<DispatchInvoiceRow>[] = [
  {
    key: "invoiceNo",
    label: "Invoice no.",
    accessor: (row) => row.invoiceNo,
    sortable: true,
    filter: "text",
    lov: false,
    cellClassName: "font-mono font-semibold",
    render: (row) => <Link href={`/dashboard/auction/${row.id}`} className="text-green-700 hover:underline dark:text-green-400">{row.invoiceNo}</Link>,
  },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "sellingMark", label: "Selling mark", accessor: (row) => row.sellingMark, sortable: true, filter: "select" },
  { key: "invoiceDate", label: "Invoice date", accessor: (row) => row.invoiceDate, sortable: true, lov: false, searchInput: "date", cellClassName: "tabular-nums", render: (row) => row.invoiceDate ?? "—" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate, sortable: true, lov: false, searchInput: "date", cellClassName: "tabular-nums", render: (row) => row.saleDate ?? "—" },
  { key: "lotsCount", label: "Lots", accessor: (row) => row.lotsCount, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
  { key: "netWt", label: "Net kg", accessor: (row) => row.netWt, sortable: true, lov: false, searchInput: "number", headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.netWt ? Number(row.netWt).toFixed(2) : "—" },
  { key: "status", label: "Status", accessor: (row) => row.status, sortable: true, filter: "select", filterOptions: enumFilterOptions(BROKER_INVOICE_STATUSES) },
];

const INVOICE_LIST = { columns: INVOICE_COLUMNS, selectionMode: "single", add: false, edit: false, delete: false } satisfies ListDefinition<DispatchInvoiceRow>;

export function DispatchDetailLists({
  dispatchId,
  lots,
  invoices,
  isOwner,
  canEdit,
  canCreate,
  grades,
  invoiceDefaults,
}: {
  dispatchId: string;
  lots: InvoiceOverviewRow[];
  invoices: DispatchInvoiceRow[];
  isOwner: boolean;
  canEdit: boolean;
  canCreate: boolean;
  grades: GradeOption[];
  invoiceDefaults: NewInvoiceDefaults;
}) {
  const [assigning, setAssigning] = useState<InvoiceOverviewRow[] | null>(null);

  const commands: EntityListCommand<InvoiceOverviewRow>[] = [{
    id: "assign-broker",
    label: "Assign broker",
    disabled: ({ selectedRows }) => selectedRows.length === 0,
    disabledReason: ({ selectedRows }) => selectedRows.length === 0 ? "Select the lot invoices to assign." : undefined,
    // Hands the selection to the drawer below rather than running inline —
    // picking the broker is a step of its own, like the sale page's
    // reconciliation assistant.
    onOpen: ({ selectedRows }) => setAssigning(selectedRows),
  }];

  return (
    <>
    <EntityListTabs
      label="Dispatch detail lists"
      tabs={[
        {
          id: "lots",
          label: "Invoice lots",
          count: `${lots.length} lots`,
          // The Invoice Overview list itself, narrowed to this dispatch — same
          // columns, same "+ New invoice" entry row, same edit and delete
          // rules, rather than a second read-only copy that drifts from it.
          content: (
            <InvoiceOverviewTable
              rows={lots}
              dispatchId={dispatchId}
              isOwner={isOwner}
              canEdit={canEdit}
              canCreate={canCreate}
              grades={grades}
              defaults={invoiceDefaults}
              title="Invoice lots"
              commands={commands}
            />
          ),
        },
        {
          id: "invoices",
          label: "Dispatch Invoices",
          count: `${invoices.length} invoices`,
          content: (
            <EntityList
              scope="dispatch-detail-invoices"
              initialRows={invoices}
              definition={INVOICE_LIST}
              getId={(row) => row.id}
              rowLabel={(row) => `Dispatch Invoice ${row.invoiceNo}`}
              title="Dispatch Invoices"
              emptyMessage="No Dispatch Invoices in this dispatch."
            />
          ),
        },
      ]}
    />
    <AssignBrokerAssistant lots={assigning} onClose={() => setAssigning(null)} />
    </>
  );
}

/**
 * Assigns the selected lot invoices to a broker. One field — the broker — and
 * the server decides which of that broker's invoices they join (its open one
 * for the same mark and dispatch date, or a new one). The placeholder invoice
 * they came from is deleted once it holds nothing.
 *
 * IMB is deliberately in the list: assigning back to it is how a lot invoice
 * is un-assigned when the broker turns out to be wrong.
 */
function AssignBrokerAssistant({ lots, onClose }: { lots: InvoiceOverviewRow[] | null; onClose: () => void }) {
  const [brokerId, setBrokerId] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const selected = lots ?? [];

  async function assign() {
    setBusy(true);
    try {
      const result = await moveLotsToBroker(selected.map((lot) => lot.id), brokerId);
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      showAppToast(result.notice ?? "Lot invoices moved.");
      setBrokerId("");
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppDrawer
      open={selected.length > 0}
      title="Assign broker"
      description={`${selected.length} lot invoice${selected.length === 1 ? "" : "s"} selected.`}
      onClose={onClose}
      widthClass="max-w-xl"
    >
      <div className="space-y-5">
        <div>
          <span className="block text-sm font-medium text-stone-600 dark:text-stone-400">Broker</span>
          <LovCombobox
            source="auction.brokers"
            name="broker_id"
            onSelect={(option) => setBrokerId(option?.value ?? "")}
            placeholder="Select a broker"
            ariaLabel="Broker"
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900"
          />
        </div>

        <ul className="max-h-64 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200 text-sm dark:divide-stone-800 dark:border-stone-700">
          {selected.map((lot) => (
            <li key={lot.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="font-mono font-medium text-stone-800 dark:text-stone-100">{lot.invoiceNo}</span>
              <span className="truncate text-xs text-stone-500 dark:text-stone-400">
                {lot.grade} · {lot.brokerInvoiceNo || "—"} · {lot.broker}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2">
          <AppButton type="button" onClick={onClose}>Cancel</AppButton>
          <AppButton
            type="button"
            variant="primary"
            disabled={!brokerId || busy}
            busy={busy}
            busyLabel="Assigning…"
            onClick={() => void assign()}
          >
            Assign broker
          </AppButton>
        </div>
      </div>
    </AppDrawer>
  );
}
