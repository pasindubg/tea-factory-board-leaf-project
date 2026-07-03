"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { AUC, roles, str, back, nextDispatchNo } from "./_shared";

// ---------- Sales (dispatches) ----------
export async function createSale(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const np = `${AUC}/new`;
  const brokerId = str(formData.get("broker_id"));
  const saleNo = await nextDispatchNo(supabase);
  const targetSaleNo = str(formData.get("target_sale_no"));
  const saleDate = str(formData.get("sale_date"));
  if (!brokerId) back(np, "Pick a broker.");
  if (!targetSaleNo) back(np, "Sale number is required.");
  if (!saleDate) back(np, "Sale date is required.");
  const { data, error } = await supabase
    .from("auction_sales")
    .insert({
      factory_id: profile.factory_id,
      broker_id: brokerId,
      sale_no: saleNo,
      sale_date: saleDate,
      target_sale_no: targetSaleNo,
      dispatch_date: str(formData.get("dispatch_date")) || new Date().toISOString().slice(0, 10),
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) return back(np, error?.message ?? "Could not create the sale.");
  revalidatePath(AUC);
  redirect(`${AUC}/${data.id}`);
}

export { createSale as createDispatch };

export async function deleteSale(id: string) {
  const { supabase } = await requireProfile(["owner"]);
  // Cascade: remove all dependent records before the sale.
  const { data: lotIds } = await supabase.from("auction_lots").select("id").eq("sale_id", id);
  const ids = (lotIds ?? []).map((l) => l.id as string);
  if (ids.length > 0) {
    const { data: slIds } = await supabase.from("sale_lines").select("id").in("lot_id", ids);
    await supabase.from("vat_ledger").delete().in("sale_line_id", (slIds ?? []).map((s) => s.id as string));
    await supabase.from("valuations").delete().in("lot_id", ids);
    await supabase.from("sale_lines").delete().in("lot_id", ids);
    await supabase.from("lot_invoices").delete().in("lot_id", ids);
    await supabase.from("auction_audit").delete().in("lot_id", ids);
  }
  const { data: settlementIds } = await supabase.from("settlements").select("id").eq("sale_id", id);
  const sids = (settlementIds ?? []).map((s) => s.id as string);
  if (sids.length > 0) {
    await supabase.from("settlement_charges").delete().in("settlement_id", sids);
    await supabase.from("bank_txns").delete().in("matched_settlement_id", sids);
    await supabase.from("settlements").delete().in("id", sids);
  }
  await supabase.from("auction_audit").delete().eq("sale_id", id);
  await supabase.from("doc_imports").delete().eq("sale_id", id);
  await supabase.from("auction_lots").delete().eq("sale_id", id);
  await supabase.from("auction_sales").delete().eq("id", id);
  revalidatePath(AUC);
}

export async function updateSale(id: string, formData: FormData) {
  const { supabase } = await requireProfile(["owner"]);
  const updates: Record<string, string | null> = {};
  const status = str(formData.get("status"));
  const target = str(formData.get("target_sale_no"));
  const saleDate = str(formData.get("sale_date"));
  const dispatchDate = str(formData.get("dispatch_date"));
  const promptDate = str(formData.get("prompt_date"));
  if (status) updates.status = status;
  if (formData.has("target_sale_no")) updates.target_sale_no = target || null;
  if (formData.has("sale_date")) updates.sale_date = saleDate || null;
  if (dispatchDate) updates.dispatch_date = dispatchDate;
  if (formData.has("prompt_date")) updates.prompt_date = promptDate || null;
  if (Object.keys(updates).length > 0) {
    await supabase.from("auction_sales").update(updates).eq("id", id);
  }
  revalidatePath(AUC);
  revalidatePath(`${AUC}/${id}`);
}

export async function confirmDispatchDraft(id: string) {
  const { supabase } = await requireProfile(roles());
  await supabase
    .from("auction_sales")
    .update({ status: "grn" })
    .eq("id", id)
    .in("status", ["draft", "dispatched"]);
  revalidatePath(AUC);
  revalidatePath(`${AUC}/${id}`);
}
