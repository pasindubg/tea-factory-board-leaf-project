"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { updateLot, deleteLot, markReprint } from "../actions";
import { stateBucket } from "../state-buckets";
import type { LotRow } from "./lot-row";

const MIN_DISPATCH_NET_KG = 220;

export function DispatchedLotsTable({
  rows,
  setRows,
  saleId,
  isOwner,
  canEdit,
  soldLotIds,
}: {
  rows: LotRow[];
  setRows: Dispatch<SetStateAction<LotRow[]>>;
  saleId: string;
  isOwner: boolean;
  canEdit: boolean;
  soldLotIds: string[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reprintId, setReprintId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEditingId(null);
    setReprintId(null);
    setPendingIds(new Set());
  }, [rows, canEdit]);

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
            <th className="px-3 py-3">Invoice(s)</th>
            <th className="px-3 py-3">Lot no.</th>
            <th className="px-3 py-3">Grade</th>
            <th className="px-3 py-3 text-right">Bags</th>
            <th className="px-3 py-3 text-right">kg/bag</th>
            <th className="px-3 py-3 text-right">Net kg</th>
            <th className="px-3 py-3">State</th>
            <th className="px-3 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const isEditing = editingId === l.id;
            const invoices = (l.lot_invoices ?? []).map((i) => i.invoice_no);
            const invoiceLabel = invoices.length ? invoices.join(", ") : l.invoice_no ?? "";
            const displayState = soldLotIds.includes(l.id) ? "sold" : l.state;
            const bucket = stateBucket(displayState);
            const netWeight = Number(l.net_wt ?? 0);
            const hasMinimumWeightIssue = netWeight > 0 && netWeight < MIN_DISPATCH_NET_KG;
            const minimumWeightTitle = `Net weight ${netWeight.toFixed(2)} kg is below the temporary ${MIN_DISPATCH_NET_KG} kg dispatch check. Grade-specific minimums are not configured yet.`;
            const removable = l.state === "invoiced" || l.state === "pending";
            const reprintable = l.state === "acknowledged" || l.state === "catalogued" || l.state === "valued" || l.state === "withdrawn";

            return (
              <tr key={l.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0 align-top">
                {isEditing ? (
                  <EditRow
                    lot={l}
                    saleId={saleId}
                    isOwner={isOwner}
                    onCancel={() => setEditingId(null)}
                    onSaved={(patch) => {
                      setRows((curr) => curr.map((row) => (row.id === l.id ? { ...row, ...patch } : row)));
                      setEditingId(null);
                    }}
                    onBusy={(busy) => {
                      setPendingIds((prev) => {
                        const next = new Set(prev);
                        if (busy) next.add(l.id);
                        else next.delete(l.id);
                        return next;
                      });
                    }}
                  />
                ) : (
                  <>
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
                          title="This lot was not in the factory-entered dispatch — it was added from the broker's acknowledgement PDF."
                        >
                          From ack
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{l.lot_no ?? "—"}</td>
                    <td className="px-3 py-2">{l.grade}</td>
                    <td className="px-3 py-2 text-right">{l.bags ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {l.kg_per_bag != null ? Number(l.kg_per_bag).toFixed(2) : "—"}
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
                    <td className="px-3 py-2 text-right">
                      {canEdit && isOwner && removable && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingId(l.id)}
                            disabled={pendingIds.has(l.id)}
                            className="rounded p-1 text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-800 disabled:opacity-40"
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            disabled={pendingIds.has(l.id)}
                            onClick={async () => {
                              if (!confirm("Delete this lot and all its invoice records? This cannot be undone.")) return;
                              setPendingIds((prev) => new Set(prev).add(l.id));
                              try {
                                await deleteLot(l.id, saleId);
                                setRows((curr) => curr.filter((row) => row.id !== l.id));
                              } finally {
                                setPendingIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(l.id);
                                  return next;
                                });
                              }
                            }}
                            className="rounded p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c-.84 0-1.673.025-2.5.075V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.325C11.673 4.025 10.84 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.647l.467 3.265a.75.75 0 0 1-1.494.106l-.466-3.265a.75.75 0 0 1 .792-.853Zm3.336.002a.75.75 0 0 1 .763.916l-.465 3.25a.75.75 0 0 1-1.478-.253l.464-3.25a.75.75 0 0 1 .716-.663ZM9.373 7.08a.75.75 0 0 1 .734.765l-.209 3.132a.75.75 0 0 1-1.498-.04l.21-3.131a.75.75 0 0 1 .763-.726Zm1.503 0a.75.75 0 0 1 .763.726l.209 3.132a.75.75 0 1 1-1.498.04l-.209-3.131a.75.75 0 0 1 .735-.767Z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {canEdit && isOwner && reprintable && (
                        <div className="text-right">
                          {reprintId === l.id ? (
                            <ReprintForm
                              lotId={l.id}
                              saleId={saleId}
                              invoices={invoices}
                              onCancel={() => setReprintId(null)}
                              onSaved={(patch) => {
                                setRows((curr) => curr.map((row) => (row.id === l.id ? { ...row, ...patch } : row)));
                                setReprintId(null);
                              }}
                              onBusy={(busy) => {
                                setPendingIds((prev) => {
                                  const next = new Set(prev);
                                  if (busy) next.add(l.id);
                                  else next.delete(l.id);
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <button
                              onClick={() => setReprintId(l.id)}
                              disabled={pendingIds.has(l.id)}
                              className="rounded px-2 py-1 text-xs text-orange-700 hover:bg-orange-50 hover:underline dark:text-orange-400 dark:hover:bg-orange-950 disabled:opacity-40"
                            >
                              Re-print
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center">
                <p className="text-2xl mb-2">📦</p>
                <p className="text-sm text-stone-400 dark:text-stone-500">No lots yet.</p>
                <p className="text-xs text-stone-300 dark:text-stone-600 mt-1">Click + Add lot above to enter the lots you dispatched.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EditRow({
  lot,
  saleId,
  isOwner,
  onCancel,
  onSaved,
  onBusy,
}: {
  lot: LotRow;
  saleId: string;
  isOwner: boolean;
  onCancel: () => void;
  onSaved: (patch: Partial<Pick<LotRow, "invoice_no" | "lot_no" | "grade" | "bags" | "kg_per_bag" | "net_wt" | "state">>) => void;
  onBusy: (busy: boolean) => void;
}) {
  const formId = `edit-${lot.id}`;
  const [saving, setSaving] = useState(false);

  const invoices = (lot.lot_invoices ?? []).map((i) => i.invoice_no);
  return (
    <>
      <td className="px-3 py-2 font-medium">
        <input
          name="invoice_no"
          form={formId}
          defaultValue={lot.invoice_no ?? ""}
          className="w-20 rounded border border-stone-300 px-1.5 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
        />
        {invoices.length > 1 && (
          <span className="ml-1 rounded bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 text-xs text-stone-500">
            {invoices.length} inv
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          name="lot_no"
          form={formId}
          defaultValue={lot.lot_no ?? ""}
          placeholder="Lot no."
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
            {["invoiced","acknowledged","pending","missing","shutout","valued","withdrawn","re-print","sold","settled"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs ${stateBucket(lot.state).style}`}>
            {stateBucket(lot.state).label}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <form
          id={formId}
          action={async (formData) => {
            setSaving(true);
            onBusy(true);
            try {
              await updateLot(lot.id, saleId, formData);
              onSaved({
                invoice_no: String(formData.get("invoice_no") ?? "").trim() || null,
                lot_no: String(formData.get("lot_no") ?? "").trim() || null,
                grade: String(formData.get("grade") ?? "").trim() || null,
                bags: Number(String(formData.get("bags") ?? 0)) || null,
                kg_per_bag: Number(String(formData.get("kg_per_bag") ?? 0)) || null,
                net_wt: Number(((Number(String(formData.get("bags") ?? 0)) || 0) * (Number(String(formData.get("kg_per_bag") ?? 0)) || 0)).toFixed(2)),
                state: String(formData.get("state") ?? lot.state ?? "invoiced"),
              });
            } finally {
              setSaving(false);
              onBusy(false);
            }
          }}
          className="flex items-center justify-end gap-1"
        >
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded bg-green-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-60"
          >
            <span className={`h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent ${saving ? "" : "opacity-0"}`} />
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
        </form>
      </td>
    </>
  );
}

function ReprintForm({
  lotId,
  saleId,
  onCancel,
  onSaved,
  onBusy,
  invoices,
}: {
  lotId: string;
  saleId: string;
  onCancel: () => void;
  onSaved: (patch: Partial<Pick<LotRow, "state">>) => void;
  onBusy: (busy: boolean) => void;
  invoices: string[];
}) {
  const [targetSaleNo, setTargetSaleNo] = useState("");
  const [sampleKg, setSampleKg] = useState("");
  const [saving, setSaving] = useState(false);
  const invLabel = invoices.length > 1 ? `Invoices: ${invoices.join(", ")}` : `Invoice: ${invoices[0] ?? ""}`;

  return (
    <form
      action={async (formData) => {
        setSaving(true);
        onBusy(true);
        try {
          formData.set("target_sale_no", targetSaleNo);
          formData.set("sample_kg", sampleKg);
          await markReprint(lotId, saleId, formData);
          onSaved({ state: "re-print" });
        } finally {
          setSaving(false);
          onBusy(false);
        }
      }}
      className="mt-1 space-y-1 rounded-lg border border-stone-200 p-2 text-left dark:border-stone-700"
    >
      <p className="text-[10px] text-stone-400 dark:text-stone-500">{invLabel}</p>
      <input
        value={targetSaleNo}
        onChange={(e) => setTargetSaleNo(e.target.value)}
        placeholder="Target sale no."
        className="w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
      />
      <input
        value={sampleKg}
        onChange={(e) => setSampleKg(e.target.value)}
        type="number"
        min="0"
        step="0.01"
        placeholder="Sample kg lost"
        className="w-full rounded border border-stone-300 px-2 py-1 text-xs dark:border-stone-600 dark:bg-stone-800"
      />
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60"
        >
          <span className={`h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent ${saving ? "" : "opacity-0"}`} />
          {saving ? "Rolling…" : "Roll forward"}
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
