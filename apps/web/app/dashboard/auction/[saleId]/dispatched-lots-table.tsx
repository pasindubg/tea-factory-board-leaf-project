"use client";

import { useEffect, useState } from "react";
import { createDispatchedLotForList, updateLot, deleteLot, markReprint } from "../actions";
import { stateBucket } from "../state-buckets";
import type { LotRow } from "./lot-row";
import { EntityList, type EntityListColumn, type EntityListContext } from "@/components/entity-list";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSelectionCell, ListSelectionHeader, ListSurface, SortButton, type ListDefinition } from "@/components/list-controls";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";
import { LOT_STATES } from "../lot-states";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DispatchLotForm } from "./dispatch-lot-form";

const COLUMNS: EntityListColumn<LotRow>[] = [
  { key: "invoice_no", label: "Invoice(s)", accessor: (r) => (r.lot_invoices ?? []).map((i) => i.invoice_no).join(", ") || r.invoice_no || null, sortable: true, filter: "text" },
  { key: "sale_no", label: "Sale", accessor: (r) => r.final_sale_no ?? r.provisional_sale_no ?? null, sortable: true, filter: "text" },
  { key: "lot_no", label: "Lot no.", accessor: (r) => r.lot_no ?? null, sortable: true, filter: "text" },
  { key: "grade", label: "Grade", accessor: (r) => r.grade ?? null, sortable: true, filter: "select" },
  { key: "bags", label: "Bags", accessor: (r) => r.bags ?? null, sortable: true },
  { key: "kg_per_bag", label: "kg/bag", accessor: (r) => r.kg_per_bag ?? null, sortable: true },
  { key: "sample_allowance", label: "Sample kg", accessor: (r) => Number(r.sample_allowance ?? 0), sortable: true },
  { key: "net_wt", label: "Net kg", accessor: (r) => Number(r.net_wt ?? 0), sortable: true },
  { key: "state", label: "State", accessor: (r) => r.state ?? null, sortable: true, filter: "select", filterOptions: LOT_STATES.map((s) => ({ value: s, label: s })) },
];

const LIST: ListDefinition<LotRow> = {
  columns: COLUMNS,
  selectionMode: "single",
  add: true,
  edit: true,
  delete: true,
};

export function DispatchedLotsTable({
  initialRows,
  saleId,
  isOwner,
  canEdit,
  canAdd,
  grades,
  soldLotIds,
  title = "Lot invoices",
  onRowsChange,
}: {
  initialRows: LotRow[];
  saleId: string;
  isOwner: boolean;
  canEdit: boolean;
  canAdd: boolean;
  grades: { code: string; name: string }[];
  soldLotIds: string[];
  title?: string;
  onRowsChange?: (rows: LotRow[]) => void;
}) {
  return (
    <EntityList
      resource={{ key: "auction.dispatch-lots", params: { saleId } }}
      initialRows={initialRows}
      definition={LIST}
      getId={(row) => row.id}
      rowLabel={(row) => row.invoice_no ?? row.lot_no ?? "lot"}
      emptyMessage="No lot invoices yet."
      renderMode="workflow"
      render={(data) => (
        <DispatchedLotsWorkflow
          data={data}
          saleId={saleId}
          isOwner={isOwner}
          canEdit={canEdit}
          canAdd={canAdd}
          grades={grades}
          soldLotIds={soldLotIds}
          title={title}
          onRowsChange={onRowsChange}
        />
      )}
    />
  );
}

function DispatchedLotsWorkflow({
  data,
  saleId,
  isOwner,
  canEdit,
  canAdd,
  grades,
  soldLotIds,
  title = "Lot invoices",
  onRowsChange,
}: {
  data: EntityListContext<LotRow>;
  saleId: string;
  isOwner: boolean;
  canEdit: boolean;
  canAdd: boolean;
  grades: { code: string; name: string }[];
  soldLotIds: string[];
  title?: string;
  onRowsChange?: (rows: LotRow[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reprintId, setReprintId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [lotToDelete, setLotToDelete] = useState<string | null>(null);
  const { rows, refreshing, mutate, mutationAction, controls, selection, visibleRows } = data;
  const selectedLot = rows.find((row) => row.id === selection.selectedId) ?? null;
  const selectedLotCanDelete = Boolean(selectedLot && (isOwner || selectedLot.state === "invoiced" || selectedLot.state === "pending"));
  const selectedLotCanReprint = Boolean(selectedLot && ["acknowledged", "catalogued", "valued", "withdrawn"].includes(selectedLot.state ?? ""));
  const reprintLot = rows.find((row) => row.id === reprintId) ?? null;
  const totalNet = rows.reduce((sum, lot) => sum + Number(lot.net_wt ?? 0), 0);

  useEffect(() => onRowsChange?.(rows), [onRowsChange, rows]);

  useEffect(() => {
    setEditingId(null);
    setReprintId(null);
    setPendingIds(new Set());
  }, [canEdit]);

  const createLot = mutationAction(
    (formData) => createDispatchedLotForList(saleId, formData),
    { onSuccess: () => setAdding(false) },
  );

  async function confirmLotDelete() {
    if (!lotToDelete) return;
    const id = lotToDelete;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await mutate(() => deleteLot(id, saleId), {
        onSuccess: () => {
          selection.clear();
          setLotToDelete(null);
        },
      });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <ListSurface
      title={title}
      description={`${rows.length} lot${rows.length === 1 ? "" : "s"} · ${totalNet.toFixed(2)} kg net`}
      onCreate={() => setAdding(true)}
      canCreate={canAdd && !adding && !editingId && !reprintId && pendingIds.size === 0 && !refreshing}
      createDisabledReason={canAdd ? "Finish the current lot action first." : "You cannot add lots after this broker invoice is confirmed."}
      createLabel="New lot"
      refreshing={refreshing || pendingIds.size > 0}
    >
      <ListCommandToolbar
        mode={LIST.selectionMode ?? "single"}
        count={selection.selectedCount}
        enableEdit={Boolean(canEdit && LIST.edit)}
        onEdit={{ label: "Edit", onClick: () => selectedLot && setEditingId(selectedLot.id), disabled: !selectedLot || Boolean(editingId) || Boolean(reprintId) || adding || pendingIds.has(selectedLot?.id ?? "") }}
        enableDelete={Boolean(canEdit && LIST.delete)}
        onDelete={{ label: "Delete", onClick: () => selectedLot && setLotToDelete(selectedLot.id), disabled: !selectedLotCanDelete || Boolean(editingId) || Boolean(reprintId) || adding || pendingIds.has(selectedLot?.id ?? "") }}
      >
        {canEdit && isOwner && !editingId && (
          <button
            type="button"
            onClick={() => selectedLot && setReprintId(selectedLot.id)}
            disabled={!selectedLotCanReprint || Boolean(reprintId) || adding || pendingIds.has(selectedLot?.id ?? "")}
            className="inline-flex min-h-10 items-center rounded-full border border-orange-200 bg-white px-4 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-orange-900 dark:bg-stone-900 dark:text-orange-300 dark:hover:bg-orange-950"
          >
            Re-print
          </button>
        )}
        {editingId && (
          <>
            <button type="button" onClick={() => setEditingId(null)} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold dark:border-stone-600">Cancel</button>
            <button form={`edit-${editingId}`} disabled={pendingIds.has(editingId)} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Save changes</button>
          </>
        )}
      </ListCommandToolbar>
      <ListCreatePanel open={adding} title="New lot">
        <DispatchLotForm open={adding} action={createLot} grades={grades} onCancel={() => setAdding(false)} />
      </ListCreatePanel>
      {reprintLot && (
        <ListCreatePanel open title="Mark selected lot as re-print">
          <ReprintForm
            invoices={(reprintLot.lot_invoices ?? []).map((invoice) => invoice.invoice_no)}
            existingSampleKg={Number(reprintLot.sample_allowance ?? 0)}
            onCancel={() => setReprintId(null)}
            action={async (formData) => {
              setPendingIds((current) => new Set(current).add(reprintLot.id));
              try {
                await mutate(() => markReprint(reprintLot.id, saleId, formData), {
                  onSuccess: () => setReprintId(null),
                });
              } finally {
                setPendingIds((current) => {
                  const next = new Set(current);
                  next.delete(reprintLot.id);
                  return next;
                });
              }
            }}
          />
        </ListCreatePanel>
      )}
      <ListSearchPanel columns={LIST.columns} controls={controls} />
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            <ListSelectionHeader mode={LIST.selectionMode ?? "single"} scope="dispatch-lots" />
            {LIST.columns.map((col) => (
              <th key={col.key} className={`px-3 py-3 ${["bags", "kg_per_bag", "sample_allowance", "net_wt"].includes(col.key) ? "text-right" : ""}`}>
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((l) => {
            const isEditing = editingId === l.id;
            const invoices = (l.lot_invoices ?? []).map((i) => i.invoice_no);
            const invoiceLabel = (invoices.length ? invoices : [l.invoice_no ?? ""]).map(formatFourDigitNo).filter(Boolean).join(", ");
            const displayState = soldLotIds.includes(l.id) ? "sold" : l.state;
            const bucket = stateBucket(displayState);
            const netWeight = Number(l.net_wt ?? 0);
            const minNetKg = l.threshold_min_net_kg ?? 0;
            const hasMinimumWeightIssue = l.threshold_applies && minNetKg > 0 && netWeight > 0 && netWeight < minNetKg;
            const minimumWeightTitle = `Net weight ${netWeight.toFixed(2)} kg is below the ${minNetKg.toFixed(2)} kg broker/grade threshold.`;
            return (
              <tr
                key={l.id}
                {...selection.rowProps(l.id, isEditing || reprintId === l.id)}
                className={`cursor-pointer border-b border-stone-100 dark:border-stone-800 last:border-0 align-top ${selection.isSelected(l.id) ? "bg-green-50/60 dark:bg-green-950/20" : ""}`}
              >
                {isEditing ? (
                  <EditRow
                    lot={l}
                    isOwner={isOwner}
                    action={async (formData) => {
                      setPendingIds((current) => new Set(current).add(l.id));
                      try {
                        await mutate(() => updateLot(l.id, saleId, formData), {
                          onSuccess: () => setEditingId(null),
                        });
                      } finally {
                        setPendingIds((current) => {
                          const next = new Set(current);
                          next.delete(l.id);
                          return next;
                        });
                      }
                    }}
                  />
                ) : (
                  <>
                    <ListSelectionCell
                      mode={LIST.selectionMode ?? "single"}
                      scope="dispatch-lots"
                      name="selected_dispatch_lot"
                      id={l.id}
                      label={`lot ${invoiceLabel || l.lot_no || l.id}`}
                      checked={selection.isSelected(l.id)}
                      onChange={() => selection.select(l.id)}
                    />
                    <td className="px-3 py-2 font-medium">
                      {invoiceLabel}
                      {invoices.length > 1 && (
                        <span className="ml-1 rounded bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 text-xs text-stone-500 dark:text-stone-400">
                          {invoices.length} invoices
                        </span>
                      )}
                      {l.lot_source === "acknowledgement" && (
                        <span
                          className="ml-1 rounded-full bg-purple-100 dark:bg-purple-900 px-1.5 py-0.5 text-xs text-purple-800 dark:text-purple-300"
                          title="This lot was not in the factory-entered broker invoice — it was added from the broker's acknowledgement PDF."
                        >
                          From ack
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums">{formatSaleNo(l.final_sale_no ?? l.provisional_sale_no) || "—"}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${l.final_sale_no ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"}`}>
                          {l.final_sale_no ? "Final" : "Temporary"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{l.lot_no ?? "—"}</td>
                    <td className="px-3 py-2">{l.grade}</td>
                    <td className="px-3 py-2 text-right">{l.bags ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {l.kg_per_bag != null ? Number(l.kg_per_bag).toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.sample_allowance != null ? Number(l.sample_allowance).toFixed(2) : "0.00"}
                    </td>
                    <td className="px-3 py-2 text-right">{netWeight.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${bucket?.style ?? "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"}`}
                          title={l.shutout_reason ? `${displayState}: ${l.shutout_reason}` : displayState ?? ""}
                        >
                          {bucket?.label ?? l.state}
                        </span>
                        {hasMinimumWeightIssue && (
                          <span
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-300"
                            title={minimumWeightTitle}
                          >
                            Min kg
                          </span>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={9} className="px-6 py-12 text-center">
                <p className="text-sm text-stone-400 dark:text-stone-500">No lots match these filters.</p>
                <button type="button" onClick={controls.clearFilters} className="mt-1 text-xs text-green-700 hover:underline dark:text-green-400">
                  Clear filters
                </button>
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-6 py-12 text-center">
                <p className="text-2xl mb-2">📦</p>
                <p className="text-sm text-stone-400 dark:text-stone-500">No lots yet.</p>
                <p className="text-xs text-stone-300 dark:text-stone-600 mt-1">Use New lot to enter the specific invoices under this broker invoice.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <ConfirmationDialog
        open={lotToDelete !== null}
        title="Delete lot?"
        description="Owned invoice and valuation records are removed; financial sale or VAT records safely block deletion. This cannot be undone."
        confirmLabel="Delete lot"
        destructive
        busy={lotToDelete ? pendingIds.has(lotToDelete) : false}
        onCancel={() => setLotToDelete(null)}
        onConfirm={confirmLotDelete}
      />
    </ListSurface>
  );
}

export function EditRow({
  lot,
  isOwner,
  action,
}: {
  lot: LotRow;
  isOwner: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formId = `edit-${lot.id}`;
  const invoices = (lot.lot_invoices ?? []).map((i) => i.invoice_no);
  return (
    <>
      <td className="px-3 py-2 font-medium">
        <form
          id={formId}
          action={action}
        />
        <input
          name="invoice_no"
          form={formId}
          defaultValue={formatFourDigitNo(lot.invoice_no)}
          onBlur={(event) => {
            event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          }}
          className="w-20 rounded border border-stone-300 px-1.5 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
        />
        {invoices.length > 1 && (
          <span className="ml-1 rounded bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 text-xs text-stone-500">
            {invoices.length} inv
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        <span className="tabular-nums">{formatSaleNo(lot.final_sale_no ?? lot.provisional_sale_no) || "—"}</span>
        <span className="ml-1 text-stone-400">{lot.final_sale_no ? "Final" : "Temporary"}</span>
      </td>
      <td className="px-3 py-2">
        <input
          name="lot_no"
          form={formId}
          defaultValue={formatFourDigitNo(lot.lot_no)}
          placeholder="Lot no."
          onBlur={(event) => {
            event.currentTarget.value = formatFourDigitNo(event.currentTarget.value);
          }}
          className="w-16 rounded border border-stone-300 px-1.5 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
        />
      </td>
      <td className="px-3 py-2">
        <input
          name="grade"
          form={formId}
          defaultValue={lot.grade ?? ""}
          className="w-20 rounded border border-stone-300 px-1.5 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          name="bags"
          form={formId}
          type="number"
          min="0"
          defaultValue={lot.bags ?? ""}
          className="w-16 rounded border border-stone-300 px-1.5 py-1 text-right text-xs dark:border-stone-600 dark:bg-stone-800"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          name="kg_per_bag"
          form={formId}
          type="number"
          min="0"
          step="0.01"
          defaultValue={lot.kg_per_bag != null ? Number(lot.kg_per_bag) : ""}
          className="w-16 rounded border border-stone-300 px-1.5 py-1 text-right text-xs dark:border-stone-600 dark:bg-stone-800"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          name="sample_allowance"
          form={formId}
          type="number"
          min="0"
          step="0.01"
          defaultValue={lot.sample_allowance != null ? Number(lot.sample_allowance) : ""}
          className="w-20 rounded border border-stone-300 px-1.5 py-1 text-right text-xs dark:border-stone-600 dark:bg-stone-800"
        />
      </td>
      <td className="px-3 py-2 text-right text-xs">
        {Number(lot.net_wt ?? 0).toFixed(2)}
      </td>
      <td className="px-3 py-2">
        {isOwner ? (
          <select
            name="state"
            form={formId}
            defaultValue={lot.state ?? "invoiced"}
            className="w-24 rounded border border-stone-300 px-1.5 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
          >
            {LOT_STATES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs ${stateBucket(lot.state).style}`}>
            {stateBucket(lot.state).label}
          </span>
        )}
      </td>
    </>
  );
}

function ReprintForm({
  onCancel,
  action,
  invoices,
  existingSampleKg,
}: {
  onCancel: () => void;
  action: (formData: FormData) => void | Promise<void>;
  invoices: string[];
  existingSampleKg: number;
}) {
  const [saving, setSaving] = useState(false);
  const invLabel = invoices.length > 1 ? `Invoices: ${invoices.join(", ")}` : `Invoice: ${invoices[0] ?? ""}`;

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        try {
          await action(formData);
        } finally {
          setSaving(false);
        }
      }}
      className="mt-1 space-y-2 rounded-lg border border-stone-200 p-2 text-left dark:border-stone-700"
    >
      <p className="text-[10px] text-stone-400 dark:text-stone-500">{invLabel}</p>
      <p className="text-[11px] leading-4 text-stone-500 dark:text-stone-400">
        This keeps the lot in this sale as history. When the same invoice is added to a later dispatch, the new lot is linked as the re-print.
      </p>
      <label className="block text-[11px] text-stone-500 dark:text-stone-400">
        Additional sample kg
        <input
          name="additional_sample_kg"
          type="number"
          min="0"
          step="0.01"
          defaultValue={existingSampleKg || ""}
          placeholder="0.00"
          className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
        />
      </label>
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60"
        >
          <span className={`h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent ${saving ? "" : "opacity-0"}`} />
          {saving ? "Marking..." : "Mark re-print"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
