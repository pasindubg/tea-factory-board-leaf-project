"use client";

import { useState } from "react";
import Link from "next/link";
import { EntityList, type EntityListColumn } from "@/components/entity-list";
import { LovCombobox } from "@/components/lov-combobox";
import type { ListDefinition } from "@/components/list-controls";
import type { AuctionReprintOverviewListRow } from "@/lib/list-resources";
import { registerReprintEntry } from "../actions";
import { entrySourceChip, entrySourceOptions } from "../entry-source";
import { LOT_STATES } from "../lot-states";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { stateBucketOptions } from "../state-buckets";

export type ReprintOverviewRow = AuctionReprintOverviewListRow;

export type HistoricReprintCandidate = {
  id: string;
  label: string;
  existingSampleKg: number;
};

export type ReprintGradeOption = {
  code: string;
  name: string;
  sampleWeight: number | null;
  defaultKgPerBag: number | null;
};

const COLUMNS: EntityListColumn<ReprintOverviewRow>[] = [
  { key: "dispatchNo", label: "Broker invoice", accessor: (row) => row.dispatchNo ?? null, sortable: true, filter: "text", render: (row) => <Link href={`/dashboard/auction/${row.dispatchId}`} className="font-medium text-green-700 hover:underline dark:text-green-400">{row.dispatchNo ?? "—"}</Link> },
  // Where the chain STARTED. A re-print entered at cutover never had a
  // dispatch here, and reads as a real one without this.
  { key: "entrySource", label: "Origin", accessor: (row) => entrySourceChip(row.entrySource).label, sortable: true, filter: "select", filterOptions: entrySourceOptions(), minWidth: 150, render: (row) => { const chip = entrySourceChip(row.entrySource); return <span className={`rounded-full px-2 py-0.5 text-xs ${chip.style}`}>{chip.label}</span>; } },
  { key: "saleNo", label: "First sale", accessor: (row) => row.saleNo ?? null, sortable: true, filter: "text", render: (row) => row.saleNo ?? "—" },
  { key: "soldSaleNo", label: "Sold sale", accessor: (row) => row.soldSale ?? null, sortable: true, filter: "text", render: (row) => row.soldSale ?? "—" },
  { key: "broker", label: "Broker", accessor: (row) => row.broker, sortable: true, filter: "select" },
  { key: "invoiceNo", label: "Invoice(s)", accessor: (row) => row.invoiceNo, sortable: true, filter: "text", cellClassName: "font-medium" },
  { key: "lotNo", label: "Lot no.", accessor: (row) => row.lotNo ?? null, sortable: true, filter: "text", render: (row) => row.lotNo ?? "—" },
  { key: "grade", label: "Grade", accessor: (row) => row.grade ?? null, sortable: true, filter: "select", render: (row) => row.grade ?? "—" },
  { key: "bags", label: "Bags", accessor: (row) => row.bags ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.bags ?? "—" },
  { key: "kgPerBag", label: "kg/bag", accessor: (row) => row.kgPerBag ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.kgPerBag != null ? row.kgPerBag.toFixed(2) : "—" },
  { key: "reprintSales", label: "Re-printed sales", accessor: (row) => row.reprintSales, sortable: true, filter: "text" },
  { key: "totalSampleKg", label: "Total sample kg", accessor: (row) => row.totalSampleKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.totalSampleKg.toFixed(2) },
  { key: "remainingNetKg", label: "Remaining kg", accessor: (row) => row.remainingNetKg, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.remainingNetKg.toFixed(2) },
  { key: "actualSoldKg", label: "Actual sold kg", accessor: (row) => row.actualSoldKg ?? null, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums", render: (row) => row.actualSoldKg != null ? row.actualSoldKg.toFixed(2) : "—" },
  { key: "history", label: "History", accessor: (row) => row.history, filter: "text", cellClassName: "min-w-64 text-xs text-stone-500 dark:text-stone-400" },
  { key: "dispatchDate", label: "Invoice date", accessor: (row) => row.dispatchDate ?? null, sortable: true, searchInput: "date", cellClassName: "tabular-nums", render: (row) => row.dispatchDate ?? "—" },
  { key: "saleDate", label: "Sale date", accessor: (row) => row.saleDate ?? null, sortable: true, searchInput: "date", cellClassName: "tabular-nums", render: (row) => row.saleDate ?? "—" },
  { key: "source", label: "Source", accessor: (row) => row.source ?? null, sortable: true, filter: "select", render: (row) => row.source ?? "—" },
  { key: "stateLabel", label: "State", accessor: (row) => row.stateLabel, sortable: true, filter: "select", filterOptions: stateBucketOptions(LOT_STATES), render: (row) => <span className={`rounded-full px-2 py-0.5 text-xs ${row.stateStyle}`}>{row.stateLabel}</span> },
  { key: "reprintCount", label: "Re-print count", accessor: (row) => row.reprintCount, sortable: true, headerClassName: "text-right", cellClassName: "text-right tabular-nums" },
];

const LIST: ListDefinition<ReprintOverviewRow> = { columns: COLUMNS, selectionMode: "single", add: true };

export function ReprintOverviewTable({
  rows,
  historicCandidates,
  canRegisterHistoric,
  today,
  grades,
}: {
  rows: ReprintOverviewRow[];
  historicCandidates: HistoricReprintCandidate[];
  canRegisterHistoric: boolean;
  today: string;
  grades: ReprintGradeOption[];
}) {
  return (
    <EntityList
      initialRows={rows}
      resource={{ key: "auction.reprint-overview" }}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => `invoice ${row.invoiceNo}`}
      canCreate={canRegisterHistoric}
      create={{
        action: registerReprintEntry,
        label: "Register re-print",
        panelTitle: "Register re-print",
        disabledReason: "Only the owner can register a re-print.",
        render: ({ action, close }) => (
          <RegisterReprintForm
            candidates={historicCandidates}
            today={today}
            grades={grades}
            action={action}
            onCancel={close}
          />
        ),
      }}
      emptyMessage="No invoices have been marked for re-print yet."
      filteredEmptyMessage="No re-print lots match these filters."
    />
  );
}

const field = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800";
const labelText = "block text-sm font-medium text-stone-700 dark:text-stone-200";
const hint = "mt-1 block text-xs font-normal text-stone-500 dark:text-stone-400";

/**
 * The list's single create panel. Both ways into the re-print chain are
 * entered here so the list keeps exactly one `+ New` control:
 *
 * - **Outstanding** — the lot is not in this system at all, because its sale
 *   predates it. Entered as an ordinary lot invoice (same numbering, prefix,
 *   grade and kg/bag rules) under a Broker Invoice badged `Re-print register`,
 *   then moved straight to `re-print`.
 * - **Already entered** — the lot exists here and becomes the ROOT of a chain.
 */
function RegisterReprintForm({
  candidates,
  today,
  grades,
  action,
  onCancel,
}: {
  candidates: HistoricReprintCandidate[];
  today: string;
  grades: ReprintGradeOption[];
  action: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"outstanding" | "historic">("outstanding");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <fieldset className="space-y-2">
        <legend className={labelText}>What are you registering?</legend>
        <label className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
          <input type="radio" name="register_mode" value="outstanding" checked={mode === "outstanding"} onChange={() => setMode("outstanding")} className="mt-1" />
          <span>
            <span className="font-medium text-stone-800 dark:text-stone-100">Outstanding from before this system</span>
            <span className="block text-xs text-stone-500 dark:text-stone-400">
              The re-print is sitting at the broker but its sale was never entered here. Enter its details below.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
          <input type="radio" name="register_mode" value="historic" checked={mode === "historic"} onChange={() => setMode("historic")} className="mt-1" />
          <span>
            <span className="font-medium text-stone-800 dark:text-stone-100">A lot already in this system</span>
            <span className="block text-xs text-stone-500 dark:text-stone-400">
              An older lot whose re-print was never imported. It stays the chain history.
            </span>
          </span>
        </label>
      </fieldset>

      {mode === "outstanding"
        ? <OutstandingFields today={today} grades={grades} />
        : <HistoricFields candidates={candidates} />}

      <label className={labelText}>
        Reason
        <textarea name="reason" rows={2} placeholder="e.g. Outstanding re-print confirmed with the broker at cutover" className={field} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Cancel</button>
        <button type="submit" className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">Register re-print</button>
      </div>
    </form>
  );
}

/**
 * Fields for a re-print that has no record here yet. They are deliberately the
 * same ones an ordinary lot invoice takes, because the entry runs through the
 * same broker-invoice resolution and lot creation — the labels just say what
 * each one means for a lot that was dispatched before go-live.
 */
function OutstandingFields({ today, grades }: { today: string; grades: ReprintGradeOption[] }) {
  const [bags, setBags] = useState("10");
  const [kgPerBag, setKgPerBag] = useState("");
  const [sampleKg, setSampleKg] = useState("");

  // Picking a grade fills in that grade's configured sample weight, exactly as
  // the Invoice Overview draft row does. kg/bag is never auto-filled: the
  // grade's default is only a minimum the entered value is checked against.
  function pickGrade(code: string) {
    const match = grades.find((option) => option.code === code);
    if (match?.sampleWeight != null) setSampleKg(String(match.sampleWeight));
  }

  const gross = (Number(bags) || 0) * (Number(kgPerBag) || 0);
  const net = Math.max(0, gross - (Number(sampleKg) || 0));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelText}>
          Broker
          <LovCombobox source="auction.brokers" name="broker_id" required placeholder="Broker…" ariaLabel="Broker" className={field} />
          <span className={hint}>The broker holding this re-print now. A later acknowledgement from another broker will not match it.</span>
        </label>
        <label className={labelText}>
          Selling mark
          <LovCombobox source="auction.marks" name="selling_mark_id" required placeholder="Mark…" ariaLabel="Selling mark" className={field} />
        </label>
        <label className={labelText}>
          Original invoice no.
          <input
            name="invoice_no"
            required
            placeholder="e.g. 0909"
            aria-label="Original invoice number"
            onBlur={(event) => { event.currentTarget.value = formatFourDigitNo(event.currentTarget.value); }}
            className={field}
          />
          <span className={hint}>The number the broker prints for this lot. Type a prefix to request one, or leave it bare to take the active prefix.</span>
        </label>
        <label className={labelText}>
          First sale no.
          <input
            name="target_sale_no"
            required
            placeholder="e.g. 0016"
            aria-label="First sale number"
            onBlur={(event) => { event.currentTarget.value = formatSaleNo(event.currentTarget.value); }}
            className={field}
          />
          <span className={hint}>The sale this lot was originally printed for.</span>
        </label>
        <label className={labelText}>
          Sold in sale no.
          <input
            name="sold_sale_no"
            placeholder="leave blank if still unsold"
            aria-label="Sold in sale number"
            onBlur={(event) => { event.currentTarget.value = formatSaleNo(event.currentTarget.value); }}
            className={field}
          />
          <span className={hint}>The sale it actually sold in, if it already has.</span>
        </label>
        <label className={labelText}>
          Original dispatch date
          <input name="dispatch_date" type="date" required defaultValue={today} aria-label="Original dispatch date" className={field} />
        </label>
        <label className={labelText}>
          Original sale date
          <input name="sale_date" type="date" required defaultValue={today} aria-label="Original sale date" className={field} />
        </label>
        <label className={labelText}>
          Grade
          <LovCombobox source="auction.grades" name="grade" required placeholder="Grade…" ariaLabel="Grade" onSelect={(option) => pickGrade(option?.value ?? "")} className={field} />
        </label>
        <label className={labelText}>
          Bags
          <input name="bags" type="number" min="1" required aria-label="Bags" value={bags} onChange={(event) => setBags(event.target.value)} className={field} />
        </label>
        <label className={labelText}>
          kg/bag
          <input name="kg_per_bag" type="number" step="0.01" min="0" required aria-label="Weight per bag" value={kgPerBag} onChange={(event) => setKgPerBag(event.target.value)} className={field} />
        </label>
        <label className={labelText}>
          Sample kg already taken
          <input name="sample_allowance" type="number" step="0.01" min="0" aria-label="Sample weight already taken" value={sampleKg} onChange={(event) => setSampleKg(event.target.value)} className={field} />
          <span className={hint}>Cumulative sampling drawn from this lot so far, not an extra cycle.</span>
        </label>
      </div>
      <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        Gross <span className="font-medium tabular-nums">{gross.toFixed(2)}</span> kg · remaining net{" "}
        <span className="font-medium tabular-nums">{net.toFixed(2)}</span> kg
      </p>
    </div>
  );
}

function HistoricFields({ candidates }: { candidates: HistoricReprintCandidate[] }) {
  return (
    <div className="space-y-4">
      <label className={labelText}>
        Historic lot
        <select name="lot_id" defaultValue="" className={field}>
          <option value="" disabled>Select invoice</option>
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select>
        {candidates.length === 0 && (
          <span className={hint}>No eligible lots — only an acknowledged, valued, or withdrawn lot that is not already in a chain can be registered.</span>
        )}
      </label>
      <label className={labelText}>
        Additional sample kg
        <input name="additional_sample_kg" type="number" min="0" step="0.01" defaultValue="0" className={field} />
        <span className={hint}>Enter only the extra sampling taken for this historic re-print, if known.</span>
      </label>
    </div>
  );
}
