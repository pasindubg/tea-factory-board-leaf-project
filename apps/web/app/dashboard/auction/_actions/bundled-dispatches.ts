"use server";

import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireModuleAccess, requireModuleRole } from "@/lib/profile";
import { deleteTenantRow } from "@/lib/tenant-data";
import { str } from "./_shared";
import { formatFourDigitNo } from "../sale-number";

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

export async function createBundledDispatch(formData: FormData): Promise<ListMutationResult> {
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
    notice: `Dispatch ${dispatchNo} created.`,
    invalidate: [
      { kind: "exact", resource: { key: "auction.eligible-broker-invoices" } },
      { kind: "all", key: "auction.dispatches" },
    ],
  };
}
