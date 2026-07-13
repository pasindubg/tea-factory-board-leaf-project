"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/profile";
import { AUC, back, str } from "./_shared";
import { formatFourDigitNo } from "../sale-number";

const BUNDLED_DISPATCH_PATH = `${AUC}/dispatches/new`;

async function nextBundledDispatchNo(supabase: Awaited<ReturnType<typeof requireModuleAccess>>["supabase"]) {
  const { data } = await supabase.from("auction_bundled_dispatches").select("dispatch_no");
  const maximum = (data ?? []).reduce((max, row) => {
    const suffix = String(row.dispatch_no ?? "").match(/\d+$/)?.[0];
    return suffix ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return formatFourDigitNo(maximum + 1);
}

export async function createBundledDispatch(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const dispatchDateFrom = str(formData.get("dispatch_date_from"));
  const dispatchDateTo = str(formData.get("dispatch_date_to"));
  const warehouseId = str(formData.get("warehouse_id"));
  const invoiceIds = [...new Set(formData.getAll("broker_invoice_id").map(String).filter(Boolean))];

  if (!dispatchDateFrom || !dispatchDateTo) back(BUNDLED_DISPATCH_PATH, "Choose a dispatch date range.");
  if (dispatchDateFrom > dispatchDateTo) back(BUNDLED_DISPATCH_PATH, "Dispatch start date must be on or before the end date.");
  if (!warehouseId) back(BUNDLED_DISPATCH_PATH, "Choose a warehouse.");
  if (invoiceIds.length < 2) back(BUNDLED_DISPATCH_PATH, "Select at least two Broker Invoices to create a bundled dispatch.");

  // The server repeats the grouping rule: every selected Broker Invoice must be
  // eligible, unbundled, and dated within this physical dispatch range.
  const { data: invoices, error: invoiceError } = await supabase
    .from("auction_sales")
    .select("id, dispatch_date, status")
    .eq("factory_id", profile.factory_id)
    .in("id", invoiceIds);
  if (invoiceError || invoices?.length !== invoiceIds.length) {
    back(BUNDLED_DISPATCH_PATH, "One or more Broker Invoices are not eligible for bundling.");
  }
  if ((invoices ?? []).some((invoice) => !invoice.dispatch_date || invoice.dispatch_date < dispatchDateFrom || invoice.dispatch_date > dispatchDateTo)) {
    back(BUNDLED_DISPATCH_PATH, "Every selected Broker Invoice must fall within the dispatch date range.");
  }

  // The value posted by the LOV is still untrusted. Resolve it within this
  // factory and reject a retired warehouse even if its disabled option is forged.
  const { data: warehouse } = await supabase
    .from("auction_warehouses")
    .select("name, active")
    .eq("id", warehouseId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!warehouse) back(BUNDLED_DISPATCH_PATH, "Unknown warehouse.");
  const warehouseRecord = warehouse as { name: string; active: boolean };
  if (!warehouseRecord.active) back(BUNDLED_DISPATCH_PATH, "This warehouse is inactive and cannot be used for a new dispatch.");
  const warehouseName = warehouseRecord.name;

  const { data: alreadyBundled } = await supabase
    .from("auction_bundled_dispatch_invoices")
    .select("broker_invoice_id")
    .eq("factory_id", profile.factory_id)
    .in("broker_invoice_id", invoiceIds);
  if ((alreadyBundled ?? []).length > 0) {
    back(BUNDLED_DISPATCH_PATH, "A selected Broker Invoice already belongs to another bundled dispatch.");
  }

  const dispatchNo = await nextBundledDispatchNo(supabase);
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
  const bundleId = bundle?.id as string | undefined;
  if (bundleError || !bundleId) back(BUNDLED_DISPATCH_PATH, bundleError?.message ?? "Could not create the bundled dispatch.");

  const { error: linksError } = await supabase.from("auction_bundled_dispatch_invoices").insert(
    invoiceIds.map((brokerInvoiceId) => ({
      factory_id: profile.factory_id,
      bundled_dispatch_id: bundleId,
      broker_invoice_id: brokerInvoiceId,
    })),
  );
  if (linksError) {
    await supabase.from("auction_bundled_dispatches").delete().eq("id", bundleId);
    back(BUNDLED_DISPATCH_PATH, linksError.message);
  }

  revalidatePath(AUC);
  revalidatePath(BUNDLED_DISPATCH_PATH);
  redirect(`${BUNDLED_DISPATCH_PATH}?notice=${encodeURIComponent(`Bundled dispatch ${dispatchNo} created.`)}`);
}
