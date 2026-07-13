"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteSale, updateSale } from "./actions";
import { useListControls, SortButton, ListSearchPanel, type ColumnDef } from "@/components/list-controls";
import { formatSaleNo } from "./sale-number";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { showAppToast } from "@/components/action-feedback";

type SaleRow = {
  id: string;
  sale_no: string;
  target_sale_no?: string;
  dispatch_date?: string;
  sale_date?: string;
  prompt_date?: string;
  status: string;
  brokers: { name: string } | null;
};

type EditableSaleField = "target_sale_no";
type SaleDraft = Pick<SaleRow, EditableSaleField>;

const STATE_PILL: Record<string, string> = {
  dispatched: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  draft:      "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  grn:        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  catalogued: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  valued:     "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
  sold:       "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  settled:    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  broker_statement: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
};

const ALL_STATES = ["draft","grn","catalogued"];

function dispatchDisplayStatus(status: string | null | undefined) {
  return ["valued", "sold", "settled", "broker_statement"].includes(status ?? "") ? "catalogued" : (status ?? "draft");
}

const COLUMNS: ColumnDef<SaleRow>[] = [
  { key: "sale_no", label: "Dispatch no.", accessor: (r) => r.sale_no, sortable: true, filter: "text" },
  { key: "broker", label: "Broker", accessor: (r) => r.brokers?.name ?? null, sortable: true, filter: "select" },
  { key: "target_sale_no", label: "Target sale", accessor: (r) => r.target_sale_no ?? null, sortable: true, filter: "text" },
  { key: "dispatch_date", label: "Dispatched", accessor: (r) => r.dispatch_date ?? null, sortable: true, searchInput: "date" },
  { key: "sale_date", label: "Sale date", accessor: (r) => r.sale_date ?? null, sortable: true, searchInput: "date" },
  { key: "prompt_date", label: "Prompt", accessor: (r) => r.prompt_date ?? null, sortable: true, searchInput: "date" },
  { key: "status", label: "Status", accessor: (r) => dispatchDisplayStatus(r.status), sortable: true, filter: "select", filterOptions: ALL_STATES.map((s) => ({ value: s, label: s })) },
];

export function DispatchesTable({
  sales,
  isOwner,
}: {
  sales: SaleRow[];
  isOwner: boolean;
}) {
  const [rows, setRows] = useState(sales);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [deleteRequest, setDeleteRequest] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const controls = useListControls(rows, COLUMNS);
  const visibleRows = controls.rows;

  useEffect(() => {
    setRows(sales);
    setSelected(new Set());
    setEditingId(null);
    setDraft(null);
    setPendingIds(new Set());
  }, [sales]);

  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleRows.map((s) => s.id)));
  }

  function handleRowSelection(event: React.MouseEvent<HTMLTableRowElement>, id: string) {
    if ((event.target as HTMLElement).closest("a,button,input,select,textarea")) return;
    toggle(id);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ids = [...selected];
    let succeeded = 0;
    setPendingIds((prev) => new Set([...prev, ...ids]));
    for (const id of ids) {
      try {
        await deleteSale(id);
        setRows((curr) => curr.filter((row) => row.id !== id));
        succeeded += 1;
      } catch {
        showAppToast("Could not delete one or more dispatches. Please try again.", "error");
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
    if (succeeded > 0) showAppToast(`${succeeded === 1 ? "Dispatch" : "Dispatches"} deleted.`);
    setSelected(new Set());
    setPendingIds(new Set());
  }

  async function deleteOne(id: string) {
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await deleteSale(id);
      setRows((curr) => curr.filter((row) => row.id !== id));
      showAppToast("Dispatch deleted.");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      showAppToast("Could not delete the dispatch. Please try again.", "error");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function confirmDelete() {
    if (!deleteRequest) return;
    setDeleteBusy(true);
    if (deleteRequest.ids.length === 1) await deleteOne(deleteRequest.ids[0]);
    else await deleteSelected();
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
      await updateSale(id, form);
      setRows((curr) => curr.map((row) => (row.id === id ? { ...row, ...draft, target_sale_no: formatSaleNo(draft.target_sale_no) } : row)));
      setEditingId(null);
      setDraft(null);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <ListSearchPanel columns={COLUMNS} controls={controls} />
      {isOwner && selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
          <span className="text-xs font-medium text-stone-600 dark:text-stone-400">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => setDeleteRequest({ ids: [...selected], label: `Delete ${selected.size} dispatch${selected.size === 1 ? "" : "es"}?` })}
            disabled={pendingIds.size > 0}
            className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {pendingIds.size > 0 && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {pendingIds.size > 0 ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
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
            {isOwner && (
              <th className="w-8 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              </th>
            )}
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable ? <SortButton col={col} controls={controls} /> : col.label}
              </th>
            ))}
            {isOwner && <th className="w-16 px-4 py-3"></th>}
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
                tabIndex={0}
                aria-selected={selected.has(s.id)}
                onClick={(event) => handleRowSelection(event, s.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(s.id);
                  }
                }}
                className={`border-b border-stone-100 last:border-0 transition-colors dark:border-stone-800 ${
                  selected.has(s.id)
                    ? "bg-green-50/70 dark:bg-green-950/50"
                    : rowBusy
                      ? "bg-stone-50/90 dark:bg-stone-800/60"
                      : "hover:bg-stone-50 dark:hover:bg-stone-800/50"
                }`}
              >
                {isOwner && (
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="rounded" />
                  </td>
                )}
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/dashboard/auction/${s.id}`} className="text-green-700 hover:underline dark:text-green-400">
                    {s.sale_no}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-stone-600 dark:text-stone-400">{broker}</td>
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
                <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 text-xs">{s.dispatch_date ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 text-xs">{s.sale_date ?? "—"}</td>
                <td className="px-4 py-2.5 text-stone-500 dark:text-stone-400 text-xs">{s.prompt_date ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATE_PILL[displayStatus] ?? "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700"}`} title={s.status !== displayStatus ? `Saved status: ${s.status}` : displayStatus}>
                    {displayStatus}
                  </span>
                </td>
                {isOwner && (
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveRow(s.id)}
                            disabled={rowBusy}
                            className="inline-flex items-center gap-1 rounded bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-40 dark:bg-green-600 dark:hover:bg-green-700"
                            title="Save"
                          >
                            {rowBusy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={rowBusy}
                            className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteRequest({ ids: [s.id], label: "Delete this dispatch?" })}
                            disabled={rowBusy}
                            className="rounded p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors dark:text-stone-500 dark:hover:text-red-400 dark:hover:bg-red-950 disabled:opacity-40"
                            title="Delete"
                          >
                            <TrashIcon />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => beginEdit(s)}
                          disabled={rowBusy}
                          className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-40 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {visibleRows.length === 0 && rows.length > 0 && (
            <tr>
              <td colSpan={isOwner ? 9 : 7} className="px-6 py-12 text-center">
                <p className="text-sm text-stone-400 dark:text-stone-500">No dispatches match these filters.</p>
                <button type="button" onClick={controls.clearFilters} className="mt-1 text-xs text-green-700 hover:underline dark:text-green-400">
                  Clear filters
                </button>
              </td>
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isOwner ? 9 : 7} className="px-6 py-12 text-center">
                <p className="text-2xl mb-2">📋</p>
                <p className="text-sm text-stone-400 dark:text-stone-500">No dispatches yet.</p>
                <p className="text-xs text-stone-300 dark:text-stone-600 mt-1">Create your first dispatch to start tracking broker lots.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      <ConfirmationDialog
        open={deleteRequest !== null}
        title={deleteRequest?.label ?? "Delete dispatch?"}
        description="This will permanently remove the dispatch and its related records. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={deleteBusy}
        onCancel={() => setDeleteRequest(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.647l.467 3.265a.75.75 0 0 1-1.494.106l-.466-3.265a.75.75 0 0 1 .792-.853Zm3.336.002a.75.75 0 0 1 .763.916l-.465 3.25a.75.75 0 0 1-1.478-.253l.464-3.25a.75.75 0 0 1 .716-.663ZM9.373 7.08a.75.75 0 0 1 .734.765l-.209 3.132a.75.75 0 0 1-1.498-.04l.21-3.131a.75.75 0 0 1 .763-.726Zm1.503 0a.75.75 0 0 1 .763.726l.209 3.132a.75.75 0 1 1-1.498.04l-.209-3.131a.75.75 0 0 1 .735-.767Z" clipRule="evenodd" />
    </svg>
  );
}
