"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireModuleAccess, requireModuleRole } from "@/lib/profile";
import { deleteTenantRow } from "@/lib/tenant-data";
import { AUC, str } from "./_shared";
import { formatFourDigitNo } from "../sale-number";
import { isOpenDraft } from "../state-buckets";
import {
  canMarkDispatched,
  canRecordDispatchGrn,
  deriveDispatchStatus,
  DISPATCH_STATUS_LABELS,
  type DispatchStatus,
} from "../dispatch-status";

async function nextBundledDispatchNo(
  supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"],
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.from("auction_bundled_dispatches").select("dispatch_no");
  if (error) return { ok: false, error: friendlyError(error) };
  const maximum = (data ?? []).reduce((max, row) => {
    const suffix = String(row.dispatch_no ?? "").match(/\d+$/)?.[0];
    return suffix ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return { ok: true, value: formatFourDigitNo(maximum + 1) };
}

/**
 * Recomputes one dispatch's status from the broker invoices inside it and
 * writes it back when it has moved. Safe to call after any broker-invoice
 * status change — it is a pure re-derivation, not a transition, so calling it
 * twice or out of order cannot corrupt the dispatch.
 *
 * Takes an already-authorised client: the caller has been gated by whatever
 * action it belongs to (confirming an invoice, completing GRN, ingesting an
 * acknowledgement), and this is a consequence of that work rather than an
 * operation a user requests directly.
 */
export async function syncBundledDispatchStatus(
  supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"],
  dispatchId: string,
  factoryId: string,
): Promise<{ ok: true; status: DispatchStatus } | { ok: false; error: string }> {
  const [{ data: dispatch, error: dispatchError }, { data: invoices, error: invoiceError }] = await Promise.all([
    supabase
      .from("auction_bundled_dispatches")
      .select("id, status, dispatched_at")
      .eq("id", dispatchId)
      .eq("factory_id", factoryId)
      .maybeSingle(),
    supabase
      .from("auction_sales")
      .select("status")
      .eq("bundled_dispatch_id", dispatchId)
      .eq("factory_id", factoryId)
      .eq("sale_kind", "dispatch"),
  ]);
  if (dispatchError || invoiceError) return { ok: false, error: friendlyError(dispatchError ?? invoiceError) };
  if (!dispatch) return { ok: false, error: "Dispatch not found." };

  const current = dispatch.status as DispatchStatus;
  const next = deriveDispatchStatus(
    (invoices ?? []).map((invoice) => invoice.status as string | null),
    (dispatch as { dispatched_at?: string | null }).dispatched_at ?? null,
  );
  if (next === current) return { ok: true, status: current };

  const { error: updateError } = await supabase
    .from("auction_bundled_dispatches")
    .update({ status: next })
    .eq("id", dispatchId)
    .eq("factory_id", factoryId);
  if (updateError) return { ok: false, error: friendlyError(updateError) };
  return { ok: true, status: next };
}

/**
 * Re-derives the dispatch a broker invoice belongs to, if any. The three
 * broker-invoice transitions (confirm, GRN, acknowledgement) each call this so
 * the dispatch keeps up without them knowing the dispatch rules.
 */
export async function syncDispatchForBrokerInvoice(
  supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"],
  brokerInvoiceId: string,
  factoryId: string,
): Promise<void> {
  const { data } = await supabase
    .from("auction_sales")
    .select("bundled_dispatch_id")
    .eq("id", brokerInvoiceId)
    .eq("factory_id", factoryId)
    .maybeSingle();
  const dispatchId = (data as { bundled_dispatch_id?: string | null } | null)?.bundled_dispatch_id;
  if (dispatchId) await syncBundledDispatchStatus(supabase, dispatchId, factoryId);
}

/**
 * The dispatcher marking the lorry as gone — the only status the user sets by
 * hand. It records the moment rather than writing the status directly, then
 * re-derives, so a dispatch whose invoices already reached GRN lands on
 * "received" instead of stepping backwards to "dispatched".
 */
export async function markDispatchDispatched(id: string): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { data: dispatch, error } = await supabase
    .from("auction_bundled_dispatches")
    .select("id, status")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!dispatch) return { ok: false, error: "Dispatch not found." };
  if (!canMarkDispatched(dispatch.status as string)) {
    return { ok: false, error: "This dispatch has already left draft." };
  }

  const { error: markError } = await supabase
    .from("auction_bundled_dispatches")
    .update({ dispatched_at: new Date().toISOString() })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .eq("status", "draft");
  if (markError) return { ok: false, error: friendlyError(markError) };

  const synced = await syncBundledDispatchStatus(supabase, id, profile.factory_id);
  if (!synced.ok) return synced;
  revalidatePath(`${AUC}/dispatches/${id}`);
  return {
    ok: true,
    notice: `Dispatch marked as ${DISPATCH_STATUS_LABELS[synced.status].toLowerCase()}.`,
    invalidate: [{ kind: "all", key: "auction.physical-dispatches" }],
  };
}

/**
 * Bulk-completes GRN for every broker invoice inside a dispatched physical
 * dispatch. The goods for the whole dispatch arrive at the warehouse
 * together, so this is the normal way GRN is recorded — one action here
 * instead of opening each broker invoice individually. Only the status
 * moves; a GRN document can still be attached per invoice from its own
 * detail page.
 *
 * Every invoice must already be confirmed (past the open-draft stage) —
 * GRN on an unconfirmed invoice has no meaning — so the whole action is
 * rejected rather than silently skipping invoices that are not ready, and
 * the dispatcher is told which one still needs confirming.
 */
export async function completeDispatchGrn(dispatchId: string): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { data: dispatch, error: dispatchError } = await supabase
    .from("auction_bundled_dispatches")
    .select("id, status")
    .eq("id", dispatchId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (dispatchError) return { ok: false, error: friendlyError(dispatchError) };
  if (!dispatch) return { ok: false, error: "Dispatch not found." };
  if (!canRecordDispatchGrn(dispatch.status as string)) {
    return { ok: false, error: "Mark this dispatch as dispatched before recording GRN." };
  }

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("auction_sales")
    .select("id, sale_no, status")
    .eq("bundled_dispatch_id", dispatchId)
    .eq("factory_id", profile.factory_id)
    .eq("sale_kind", "dispatch");
  if (invoiceError) return { ok: false, error: friendlyError(invoiceError) };
  const invoices = (invoiceRows ?? []) as { id: string; sale_no: string; status: string }[];
  if (invoices.length === 0) return { ok: false, error: "This dispatch has no broker invoices yet." };

  const unconfirmed = invoices.filter((invoice) => isOpenDraft(invoice.status));
  if (unconfirmed.length > 0) {
    const names = unconfirmed.map((invoice) => formatFourDigitNo(invoice.sale_no) || invoice.sale_no).join(", ");
    return { ok: false, error: `Confirm Broker Invoice ${names} before recording GRN for this dispatch.` };
  }

  const pendingIds = invoices.filter((invoice) => invoice.status === "invoiced").map((invoice) => invoice.id);
  if (pendingIds.length > 0) {
    const { error: updateError } = await supabase
      .from("auction_sales")
      .update({ status: "grn" })
      .in("id", pendingIds)
      .eq("factory_id", profile.factory_id)
      .eq("status", "invoiced");
    if (updateError) return { ok: false, error: friendlyError(updateError) };
  }

  const synced = await syncBundledDispatchStatus(supabase, dispatchId, profile.factory_id);
  if (!synced.ok) return synced;
  revalidatePath(`${AUC}/dispatches/${dispatchId}`);
  revalidatePath(AUC);
  return {
    ok: true,
    notice: pendingIds.length > 0
      ? `${pendingIds.length} broker invoice${pendingIds.length === 1 ? "" : "s"} moved to GRN.`
      : "Every broker invoice was already at GRN.",
    invalidate: [
      { kind: "all", key: "auction.physical-dispatches" },
      { kind: "all", key: "auction.dispatches" },
      { kind: "all", key: "auction.invoice-overview" },
    ],
  };
}

export async function createBundledDispatch(formData: FormData): Promise<ListMutationResult & { id?: string }> {
  const { supabase, profile } = await requireModuleRole("auction", ["owner", "manager"]);
  const dispatchDateFrom = str(formData.get("dispatch_date_from"));
  const dispatchDateTo = str(formData.get("dispatch_date_to"));
  const warehouseId = str(formData.get("warehouse_id"));
  const invoiceIds = [...new Set(formData.getAll("broker_invoice_id").map(String).filter(Boolean))];

  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(dispatchDateFrom) || !isoDate.test(dispatchDateTo)) {
    return { ok: false, error: "Choose a valid dispatch date range." };
  }
  if (dispatchDateFrom > dispatchDateTo) {
    return { ok: false, error: "Dispatch start date must be on or before the end date." };
  }
  if (!warehouseId) return { ok: false, error: "Choose a warehouse." };
  if (invoiceIds.length < 2) {
    return { ok: false, error: "Select at least two Broker Invoices to create a bundled dispatch." };
  }

  // The server repeats the grouping rule: every selected Broker Invoice must be
  // eligible, unbundled, and dated within this physical dispatch range.
  const { data: invoices, error: invoiceError } = await supabase
    .from("auction_sales")
    .select("id, dispatch_date, status, bundled_dispatch_id")
    .eq("factory_id", profile.factory_id)
    .eq("sale_kind", "dispatch")
    .in("id", invoiceIds);
  if (invoiceError || invoices?.length !== invoiceIds.length) {
    return { ok: false, error: "One or more Broker Invoices are not eligible for bundling." };
  }
  if ((invoices ?? []).some((invoice) => !invoice.dispatch_date || invoice.dispatch_date < dispatchDateFrom || invoice.dispatch_date > dispatchDateTo)) {
    return { ok: false, error: "Every selected Broker Invoice must fall within the dispatch date range." };
  }
  if ((invoices ?? []).some((invoice) => invoice.bundled_dispatch_id)) {
    return { ok: false, error: "A selected Broker Invoice already belongs to another bundled dispatch." };
  }

  // The value posted by the LOV is still untrusted. Resolve it within this
  // factory and reject a retired warehouse even if its disabled option is forged.
  const { data: warehouse, error: warehouseError } = await supabase
    .from("auction_warehouses")
    .select("name, active")
    .eq("id", warehouseId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (warehouseError) return { ok: false, error: friendlyError(warehouseError) };
  if (!warehouse) return { ok: false, error: "Unknown warehouse." };
  const warehouseRecord = warehouse as { name: string; active: boolean };
  if (!warehouseRecord.active) {
    return { ok: false, error: "This warehouse is inactive and cannot be used for a new dispatch." };
  }
  const warehouseName = warehouseRecord.name;

  const { data: alreadyBundled, error: alreadyBundledError } = await supabase
    .from("auction_bundled_dispatch_invoices")
    .select("broker_invoice_id")
    .eq("factory_id", profile.factory_id)
    .in("broker_invoice_id", invoiceIds);
  if (alreadyBundledError) return { ok: false, error: friendlyError(alreadyBundledError) };
  if ((alreadyBundled ?? []).length > 0) {
    return { ok: false, error: "A selected Broker Invoice already belongs to another bundled dispatch." };
  }

  const nextDispatch = await nextBundledDispatchNo(supabase);
  if (!nextDispatch.ok) return nextDispatch;
  const dispatchNo = nextDispatch.value;
  const { data: bundle, error: bundleError } = await supabase
    .from("auction_bundled_dispatches")
    .insert({
      factory_id: profile.factory_id,
      dispatch_no: dispatchNo,
      dispatch_date: dispatchDateFrom,
      dispatch_date_from: dispatchDateFrom,
      dispatch_date_to: dispatchDateTo,
      warehouse: warehouseName,
      status: "draft",
    })
    .select("id")
    .single();
  const bundleId = String(bundle?.id ?? "");
  if (bundleError) return { ok: false, error: friendlyError(bundleError) };
  if (!bundleId) return { ok: false, error: "Could not create the bundled dispatch." };

  const { data: updatedInvoices, error: invoiceUpdateError } = await supabase
    .from("auction_sales")
    .update({ bundled_dispatch_id: bundleId })
    .eq("factory_id", profile.factory_id)
    .eq("sale_kind", "dispatch")
    .is("bundled_dispatch_id", null)
    .in("id", invoiceIds)
    .select("id");
  if (invoiceUpdateError || updatedInvoices?.length !== invoiceIds.length) {
    const rollback = await deleteTenantRow(supabase, "auction_bundled_dispatches", bundleId);
    if (rollback.error) {
      return { ok: false, error: "The dispatch could not be created, and its temporary record could not be cleaned up. Review the dispatch list before retrying." };
    }
    if (invoiceUpdateError?.code === "23505") {
      return { ok: false, error: "A broker and selling mark combination may only occur once in a bundled dispatch." };
    }
    return {
      ok: false,
      error: invoiceUpdateError
        ? friendlyError(invoiceUpdateError)
        : "A selected Broker Invoice was assigned elsewhere. Review the available invoices and try again.",
    };
  }

  const { error: linksError } = await supabase.from("auction_bundled_dispatch_invoices").insert(
    invoiceIds.map((brokerInvoiceId) => ({
      factory_id: profile.factory_id,
      bundled_dispatch_id: bundleId,
      broker_invoice_id: brokerInvoiceId,
    })),
  );
  if (linksError) {
    // The bundle FK clears invoice links and the join rows cascade atomically.
    const rollback = await deleteTenantRow(supabase, "auction_bundled_dispatches", bundleId);
    if (rollback.error) {
      return { ok: false, error: "The dispatch invoices could not be linked, and the temporary dispatch could not be cleaned up. Review the dispatch list before retrying." };
    }
    return { ok: false, error: friendlyError(linksError) };
  }

  return {
    ok: true,
    id: bundleId,
    notice: `Dispatch ${dispatchNo} created.`,
    invalidate: [
      { kind: "exact", resource: { key: "auction.eligible-broker-invoices" } },
      { kind: "all", key: "auction.dispatches" },
    ],
  };
}

/**
 * Owner-only. Edits the dispatch's own attributes — the date range and the
 * warehouse it leaves from. The dispatch number is system-assigned and the
 * set of bundled broker invoices is managed by create/delete, so neither is
 * editable here.
 *
 * The date range still has to contain every broker invoice already bundled
 * into this dispatch: narrowing it past one of them would leave that invoice
 * in a dispatch whose dates it falls outside, which is exactly the state
 * createBundledDispatch refuses to produce.
 */
export async function updateBundledDispatch(id: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("auction", ["owner"]);
  const dispatchDateFrom = str(formData.get("dispatch_date_from"));
  const dispatchDateTo = str(formData.get("dispatch_date_to"));
  const warehouseId = str(formData.get("warehouse_id"));

  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDate.test(dispatchDateFrom) || !isoDate.test(dispatchDateTo)) {
    return { ok: false, error: "Choose a valid dispatch date range." };
  }
  if (dispatchDateFrom > dispatchDateTo) {
    return { ok: false, error: "Dispatch start date must be on or before the end date." };
  }
  if (!warehouseId) return { ok: false, error: "Choose a warehouse." };

  const { data: dispatch, error: dispatchError } = await supabase
    .from("auction_bundled_dispatches")
    .select("id")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (dispatchError) return { ok: false, error: friendlyError(dispatchError) };
  if (!dispatch) return { ok: false, error: "Dispatch not found." };

  // Same untrusted-LOV handling as create: resolve the warehouse inside this
  // factory and reject a retired one even if a disabled option was forged.
  const { data: warehouse, error: warehouseError } = await supabase
    .from("auction_warehouses")
    .select("name, active")
    .eq("id", warehouseId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (warehouseError) return { ok: false, error: friendlyError(warehouseError) };
  if (!warehouse) return { ok: false, error: "Unknown warehouse." };
  const warehouseRecord = warehouse as { name: string; active: boolean };
  if (!warehouseRecord.active) {
    return { ok: false, error: "This warehouse is inactive and cannot be used for a dispatch." };
  }

  const { data: bundled, error: bundledError } = await supabase
    .from("auction_sales")
    .select("sale_no, dispatch_date")
    .eq("factory_id", profile.factory_id)
    .eq("bundled_dispatch_id", id);
  if (bundledError) return { ok: false, error: friendlyError(bundledError) };
  const outside = (bundled ?? []).filter((invoice) => {
    const date = invoice.dispatch_date as string | null;
    return !date || date < dispatchDateFrom || date > dispatchDateTo;
  });
  if (outside.length > 0) {
    const names = outside.map((invoice) => formatFourDigitNo(invoice.sale_no as string) || "unknown").join(", ");
    return { ok: false, error: `This date range excludes Broker Invoice ${names}, which is bundled into this dispatch. Widen the range or remove the invoice first.` };
  }

  const { error: updateError } = await supabase
    .from("auction_bundled_dispatches")
    .update({
      // dispatch_date is the legacy start-date column and must track the range.
      dispatch_date: dispatchDateFrom,
      dispatch_date_from: dispatchDateFrom,
      dispatch_date_to: dispatchDateTo,
      warehouse: warehouseRecord.name,
    })
    .eq("id", id)
    .eq("factory_id", profile.factory_id);
  if (updateError) return { ok: false, error: friendlyError(updateError) };

  return {
    ok: true,
    notice: "Dispatch updated.",
    invalidate: [
      { kind: "all", key: "auction.physical-dispatches" },
      { kind: "all", key: "auction.dispatches" },
    ],
  };
}

/**
 * Owner-only. Deleting a bundled (physical) dispatch does not delete the
 * broker invoices linked to it — `auction_sales.bundled_dispatch_id` is
 * ON DELETE SET NULL, so they simply become unbundled (eligible for a new
 * dispatch again) while the join rows cascade away with the dispatch.
 */
export async function deleteBundledDispatch(id: string): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleRole("auction", ["owner"]);
  const { data: dispatch } = await supabase
    .from("auction_bundled_dispatches")
    .select("id")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!dispatch) return { ok: false, error: "Dispatch not found." };
  const { error: deleteError } = await deleteTenantRow(supabase, "auction_bundled_dispatches", id);
  if (deleteError) return { ok: false, error: deleteError };
  return {
    ok: true,
    notice: "Dispatch deleted.",
    invalidate: [
      { kind: "all", key: "auction.physical-dispatches" },
      { kind: "exact", resource: { key: "auction.eligible-broker-invoices" } },
      { kind: "all", key: "auction.dispatches" },
    ],
  };
}
