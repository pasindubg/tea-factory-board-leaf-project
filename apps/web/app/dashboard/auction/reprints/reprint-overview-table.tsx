"use client";

import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import type { ListDefinition } from "@/components/list-controls";
import type { AuctionReprintOverviewListRow } from "@/lib/list-resources";
import { registerHistoricReprint } from "../actions";

export type ReprintOverviewRow = AuctionReprintOverviewListRow;

export type HistoricReprintCandidate = {
  id: string;
  label: string;
  existingSampleKg: number;
};

const COLUMNS: EntityListColumn<ReprintOverviewRow>[] = [
  { key: "dispatchNo", label: "Broker invoice", accessor: (row) => row.dispatchNo ?? null, sortable: true, filter: "text", render: (row) => <Link href={`/dashboard/auction/${row.dispatchId}`} className="font-medium text-green-700 hover:underline dark:text-green-400">{row.dispatchNo ?? "—"}</Link> },
  { key: "saleNo", label: "Sale", accessor: (row) => row.saleNo ?? null, sortable: true, filter: "text", render: (row) => row.saleNo ?? "—" },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "invoiceNo", label: "Invoice(s)", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.lotNo ?? null, sortable: true, filter: "text", render: (row) => row.lotNo ?? "—" },
  { key: "grade", label: "Grade", accessor: (row) => row.grade ?? null, sortable: true, filter: "select", render: (row) => row.grade ?? "—" },
  { key: "bags", label: "Bags", accessor: (row) => row.bags ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.bags ?? "—" },
  { key: "kgPerBag", label: "kg/bag", accessor: (row) => row.kgPerBag ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.kgPerBag != null ? row.kgPerBag.toFixed(2) : "—" },
  { key: "reprintSales", label: "Re-printed sales", accessor: (row) => row.reprintSales, sortable: true, filter: "text" },
  { key: "soldSale", label: "Sold sale", accessor: (row) => row.soldSale ?? null, sortable: true, filter: "text", render: (row) => row.soldSale ?? "—" },
  { key: "totalSampleKg", label: "Total sample kg", accessor: (row) => row.totalSampleKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.totalSampleKg.toFixed(2) },
  { key: "remainingNetKg", label: "Remaining kg", accessor: (row) => row.remainingNetKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.remainingNetKg.toFixed(2) },
  { key: "actualSoldKg", label: "Actual sold kg", accessor: (row) => row.actualSoldKg ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.actualSoldKg != null ? row.actualSoldKg.toFixed(2) : "—" },
  { key: "history", label: "History", accessor: (row) => row.history, filter: "text", cellClassName: "min-w-64 text-xs text-stone-500 dark:text-stone-400" },
  { key: "dispatchDate", label: "Invoice date", accessor: (row) => row.dispatchDate ?? null, sortable: true, searchInput: "date", cellClassName: "tabular-nums", render: (row) => row.dispatchDate ?? "—" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate ?? null, sortable: true, searchInput: "date", cellClassName: "tabular-nums", render: (row) => row.saleDate ?? "—" },
  { key: "source", label: "Source", accessor: (row) => row.source ?? null, sortable: true, filter: "select", render: (row) => row.source ?? "—" },
  { key: "stateLabel", label: "State", accessor: (row) => row.stateLabel, sortable: true, filter: "select", render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${row.stateStyle}`}>{row.stateLabel}</span> },
  { key: "reprintCount", label: "Re-print count", accessor: (row) => row.reprintCount, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
];

const LIST: ListDefinition<ReprintOverviewRow> = { columns: COLUMNS, selectionMode: "single", add: true };

export function ReprintOverviewTable({
  rows,
  historicCandidates,
  canRegisterHistoric,
}: {
  rows: ReprintOverviewRow[];
  historicCandidates: HistoricReprintCandidate[];
  canRegisterHistoric: boolean;
}) {
  const canCreate = canRegisterHistoric && historicCandidates.length > 0;
  return (
    <EntityList
      initialRows={rows}
      resource={{ key: "auction.reprint-overview" }}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `invoice ${row.invoiceNo}`}
      canCreate={canCreate}
      create={{
        action: registerHistoricReprint,
        label: "Register historic re-print",
        panelTitle: "Register historic re-print",
        disabledReason: canRegisterHistoric
          ? "No eligible historic lots are available."
          : "Only the owner can register historic re-prints.",
        render: ({ action, close }) => (
          <HistoricReprintForm candidates={historicCandidates} action={action} onCancel={close} />
        ),
      }}
      emptyMessage="No invoices have been marked for re-print yet."
      filteredEmptyMessage="No re-print lots match these filters."
    />
  );
}

function HistoricReprintForm({
  candidates,
  action,
  onCancel,
}: {
  candidates: HistoricReprintCandidate[];
  action: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-300">
        Use this for an older lot whose re-print was not imported. The original lot remains the chain history; a later reuse of the same invoice will link to it automatically.
      </p>
      <label className="block text-sm font-medium text-stone-700 dark:text-stone-200">
        Historic lot
        <select name="lot_id" required defaultValue="" className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800">
          <option value="" disabled>Select invoice</option>
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-stone-700 dark:text-stone-200">
        Additional sample kg
        <input name="additional_sample_kg" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800" />
        <span className="mt-1 block text-xs font-normal text-stone-500 dark:text-stone-400">Enter only the extra sampling taken for this historic re-print, if known.</span>
      </label>
      <label className="block text-sm font-medium text-stone-700 dark:text-stone-200">
        Reason
        <textarea name="reason" rows={3} placeholder="e.g. Re-print confirmed from the older acknowledgement" className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Cancel</button>
        <button type="submit" className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">Register re-print</button>
      </div>
    </form>
  );
}
