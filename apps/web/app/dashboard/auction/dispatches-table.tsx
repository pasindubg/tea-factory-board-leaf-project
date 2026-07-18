"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createDispatch, deleteSale, updateSale } from "./actions";
import { EntityList, type EntityListColumn, type EntityListContext } from "@/components/entity-list";
import { ListCommandToolbar, ListCreatePanel, ListSearchPanel, ListSelectionCell, ListSelectionHeader, ListSurface, SortButton } from "@/components/list-controls";
import { formatFourDigitNo, formatSaleNo, saleNoKey } from "./sale-number";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { showAppToast } from "@/components/action-feedback";
import type { AuctionDispatchListRow } from "@/lib/list-resources";
import { NewDispatchForm, type DispatchCreationOptions } from "./new-dispatch-form";

type SaleRow = AuctionDispatchListRow;

type EditableSaleField = "target_sale_no";
type SaleDraft = Pick<SaleRow, EditableSaleField>;

const STATE_PILL: Record<string, string> = {
  dispatched: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  draft:      "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  invoiced:   "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  grn:        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  catalogued: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  valued:     "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
  sold:       "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  settled:    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  broker_statement: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
};

const ALL_STATES = ["draft", "invoiced", "grn", "catalogued"];

function dispatchDisplayStatus(status: string | null | undefined) {
  return ["valued", "sold", "settled", "broker_statement"].includes(status ?? "") ? "catalogued" : (status ?? "draft");
}

const COLUMNS: EntityListColumn<SaleRow>[] = [
  { key: "sale_no", label: "Broker invoice no.", accessor: (r) => r.sale_no, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (r) => r.brokers?.name ?? null, sortable: true, filter: "select" },
  { key: "selling_mark", label: "Selling mark", accessor: (r) => r.selling_mark, sortable: true, filter: "text" },
  { key: "broker_lorry_no", label: "Lorry no.", accessor: (r) => r.broker_lorry_no, sortable: true, filter: "text" },
  { key: "driver_name", label: "Driver", accessor: (r) => r.driver_name, sortable: true, filter: "text" },
  { key: "bundle_dispatch_no", label: "Dispatch no.", accessor: (r) => r.bundle_dispatch_no, sortable: true, filter: "text" },
  { key: "target_sale_no", label: "Target sale", accessor: (r) => r.target_sale_no ?? null, sortable: true, filter: "text" },
  { key: "created_date", label: "Created date", accessor: (r) => r.created_date, sortable: true, searchInput: "date" },
  { key: "dispatch_date", label: "Invoice date", accessor: (r) => r.dispatch_date ?? null, sortable: true, searchInput: "date" },
  { key: "sale_date", label: "Sale date", accessor: (r) => r.sale_date ?? null, sortable: true, searchInput: "date" },
  { key: "prompt_date", label: "Prompt", accessor: (r) => r.prompt_date ?? null, sortable: true, searchInput: "date" },
  { key: "status", label: "Status", accessor: (r) => dispatchDisplayStatus(r.status), sortable: true, filter: "select", filterOptions: ALL_STATES.map((s) => ({ value: s, label: s })) },
];

export function DispatchesTable({
  initialRows,
  isOwner,
  creation,
}: {
  initialRows: SaleRow[];
  isOwner: boolean;
  creation: DispatchCreationOptions;
}) {
  return (
    <EntityList
      resource={{ key: "auction.dispatches" }}
      initialRows={initialRows}
      definition={{ columns: COLUMNS, selectionMode: "multi", add: true, edit: true, delete: true }}
      getId={(row) => row.id}
      rowLabel={(row) => row.sale_no ?? "broker invoice"}
      emptyMessage="No broker invoices yet."
      renderMode="workflow"
      render={(data) => <DispatchesWorkflow data={data} isOwner={isOwner} creation={creation} />}
    />
  );
}

function DispatchesWorkflow({
  data,
  isOwner,
  creation,
}: {
  data: EntityListContext<SaleRow>;
  isOwner: boolean;
  creation: DispatchCreationOptions;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [deleteRequest, setDeleteRequest] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const { rows, refreshing, mutate, mutationAction, controls, selection, visibleRows } = data;
  const latestSaleNo = rows.reduce((maximum, row) => Math.max(maximum, Number(saleNoKey(row.sale_no)) || 0), 0);
  const liveNextDispatchNo = formatFourDigitNo(Math.max(Number(saleNoKey(creation.nextDispatchNo)) || 0, latestSaleNo + 1));
  const liveDispatchHistory = rows.map((row) => ({
    saleNo: row.sale_no,
    targetSaleNo: row.target_sale_no,
    dispatchDate: row.dispatch_date,
    saleDate: row.sale_date,
  }));

  useEffect(() => {
    setEditingId(null);
    setDraft(null);
    setPendingIds(new Set());
  }, [rows]);

  async function deleteSelected(ids: string[]) {
    if (ids.length === 0) return;
    setPendingIds((prev) => new Set([...prev, ...ids]));
    try {
      await mutate(async () => {
        let succeeded = 0;
        const failures: string[] = [];
        for (const id of ids) {
          try {
            const result = await deleteSale(id);
            if (result.ok) succeeded += 1;
            else failures.push(result.error);
          } catch {
            failures.push("Could not delete this broker invoice. Please try again.");
          }
        }
        if (succeeded === 0) {
          return { ok: false, error: failures[0] ?? "No broker invoices were deleted." };
        }
        for (const failure of failures) showAppToast(failure, "error");
        return {
          ok: true,
          notice: `${succeeded} broker invoice${succeeded === 1 ? "" : "s"} deleted${failures.length ? `; ${failures.length} could not be deleted` : ""}.`,
        };
      }, { onSuccess: selection.clear });
    } finally {
      setPendingIds(new Set());
    }
  }

  async function confirmDelete() {
    if (!deleteRequest) return;
    setDeleteBusy(true);
    await deleteSelected(deleteRequest.ids);
    setDeleteBusy(false);
    setDeleteRequest(null);
  }

  function beginEdit(row: SaleRow) {
    setEditingId(row.id);
    setDraft({
      target_sale_no: row.target_sale_no ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function updateDraft(field: EditableSaleField, value: string) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  async function saveRow(id: string) {
    if (!draft) return;
    setPendingIds((prev) => new Set(prev).add(id));
    const form = new FormData();
    form.set("target_sale_no", formatSaleNo(draft.target_sale_no));
    try {
      await mutate(() => updateSale(id, form), { onSuccess: cancelEdit });
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
      title="Invoice Overview"
      description={`${rows.length} broker invoice${rows.length === 1 ? "" : "s"}`}
      onCreate={() => setCreating(true)}
      canCreate={!creating && !editingId && pendingIds.size === 0 && !deleteBusy}
      createDisabledReason="Finish the current broker-invoice action first."
      createLabel="New broker invoice"
      refreshing={refreshing}
    >
      <ListCommandToolbar
        mode="multi"
        count={selection.selectedCount}
        enableEdit={isOwner && !editingId}
        onEdit={{ label: "Edit", onClick: () => { const row = rows.find((item) => item.id === [...selection.selectedIds][0]); if (row) beginEdit(row); }, disabled: selection.selectedCount !== 1 || pendingIds.size > 0 || creating }}
        enableDelete={isOwner && !editingId}
        onDelete={{ label: "Delete", onClick: () => setDeleteRequest({ ids: [...selection.selectedIds], label: `Delete ${selection.selectedCount} broker invoice${selection.selectedCount === 1 ? "" : "s"}?` }), disabled: selection.selectedCount === 0 || pendingIds.size > 0 || creating, busy: deleteBusy }}
      >
        {editingId && (
          <>
            <button type="button" onClick={cancelEdit} className="min-h-10 rounded-full border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Cancel</button>
            <button type="button" onClick={() => saveRow(editingId)} disabled={pendingIds.has(editingId)} className="min-h-10 rounded-full bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-40 dark:bg-green-600 dark:hover:bg-green-500">Save changes</button>
          </>
        )}
      </ListCommandToolbar>
      <ListCreatePanel open={creating} title="New broker invoice">
        <NewDispatchForm
          {...creation}
          nextDispatchNo={liveNextDispatchNo}
          dispatchHistory={liveDispatchHistory}
          action={mutationAction(createDispatch, { onSuccess: () => setCreating(false) })}
          onCancel={() => setCreating(false)}
        />
      </ListCreatePanel>
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      {pendingIds.size > 0 && (
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2 dark:border-stone-800">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          <span className="text-xs text-green-700 dark:text-green-400">Updating list…</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wider text-stone-400 dark:border-stone-700 dark:text-stone-500">
            {isOwner && <ListSelectionHeader mode="multi" scope="dispatches" checked={selection.allVisibleSelected(visibleRows)} onChange={() => selection.toggleVisible(visibleRows)} disabled={pendingIds.size > 0 || Boolean(editingId)} />}
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((s) => {
            const broker = s.brokers?.name ?? "—";
            const isEditing = editingId === s.id;
            const rowBusy = pendingIds.has(s.id);
            const displayStatus = dispatchDisplayStatus(s.status);
            return (
              <tr
                key={s.id}
                {...selection.rowProps(s.id, !isOwner || isEditing || rowBusy)}
                className={`border-b border-stone-100 last:border-0 transition-colors dark:border-stone-800 ${
                  selection.isSelected(s.id)
                    ? "bg-green-50/70 dark:bg-green-950/50"
                    : rowBusy
                      ? "bg-stone-50/90 dark:bg-stone-800/60"
                      : "hover:bg-stone-50 dark:hover:bg-stone-800/50"
                }`}
              >
                {isOwner && <ListSelectionCell mode="multi" scope="dispatches" id={s.id} label={`broker invoice ${s.sale_no}`} checked={selection.isSelected(s.id)} onChange={() => selection.toggle(s.id)} disabled={rowBusy || isEditing} />}
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/dashboard/auction/${s.id}`} className="text-green-700 hover:underline dark:text-green-400">
                    {s.sale_no}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">{broker}</td>
                <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">{s.selling_mark ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">{s.broker_lorry_no ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">{s.driver_name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-stone-600 dark:text-stone-400">{s.bundle_dispatch_no ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {isEditing ? (
                    <input
                      value={draft?.target_sale_no ?? ""}
                      onChange={(e) => updateDraft("target_sale_no", e.target.value)}
                      onBlur={(e) => updateDraft("target_sale_no", formatSaleNo(e.target.value))}
                      placeholder="—"
                      className="w-24 rounded border border-stone-300 px-2 py-1 text-xs outline-none ring-0 dark:border-stone-600 dark:bg-stone-800"
                    />
                  ) : (
                    formatSaleNo(s.target_sale_no) || <span className="text-stone-300 dark:text-stone-600">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-stone-500 dark:text-stone-400">{s.created_date ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 text-xs">{s.dispatch_date ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 text-xs">{s.sale_date ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 text-xs">{s.prompt_date ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATE_PILL[displayStatus] ?? "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700"}`} title={s.status !== displayStatus ? `Saved status: ${s.status}` : displayStatus}>
                    {displayStatus}
                  </span>
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={isOwner ? 13 : 12} className="px-6 py-12 text-center">
                <p className="text-sm text-stone-400 dark:text-stone-500">No broker invoices match these filters.</p>
                <button type="button" onClick={controls.clearFilters} className="mt-1 text-xs text-green-700 hover:underline dark:text-green-400">
                  Clear filters
                </button>
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isOwner ? 13 : 12} className="px-6 py-12 text-center">
                <p className="text-2xl mb-2">📋</p>
                <p className="text-sm text-stone-400 dark:text-stone-500">No broker invoices yet.</p>
                <p className="text-xs text-stone-300 dark:text-stone-600 mt-1">Create your first broker invoice to start tracking its lot invoices.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <ConfirmationDialog
        open={deleteRequest !== null}
        title={deleteRequest?.label ?? "Delete broker invoice?"}
        description="This will permanently remove the broker invoice and its related records. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deleteBusy}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={confirmDelete}
      />
    </ListSurface>
  );
}
