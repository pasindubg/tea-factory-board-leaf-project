"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { AUC, roles, str, num, back } from "./_shared";

export async function updateLot(id: string, saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const updates: Record<string, string | number | null> = {};
  const invoiceNo = str(formData.get("invoice_no"));
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const lotNo = str(formData.get("lot_no"));
  const newState = str(formData.get("state"));
  if (invoiceNo) updates.invoice_no = invoiceNo;
  if (grade) updates.grade = grade;
  // Always update lot_no if present in the form (even if clearing it)
  if (formData.has("lot_no")) updates.lot_no = lotNo || null;
  if (bags > 0) updates.bags = bags;
  if (kgPerBag > 0) updates.kg_per_bag = kgPerBag;
  if (bags > 0 && kgPerBag > 0) updates.net_wt = Number((bags * kgPerBag).toFixed(2));

  // State override — owners only, for when the PDF parser missed something.
  const isOwner = profile.role === "owner";
  const validStates = ["invoiced", "dispatched", "pending", "catalogued", "missing", "shutout", "valued", "withdrawn"];
  if (newState && isOwner && validStates.includes(newState)) {
    updates.state = newState;
    if (newState === "shutout") updates.shutout_reason = str(formData.get("shutout_reason")) || "Manual override";
    else updates.shutout_reason = null;
  }

  if (Object.keys(updates).length === 0) redirect(detail);
  await supabase.from("auction_lots").update(updates).eq("id", id);
  revalidatePath(detail);
  redirect(detail);
}

export async function markReprint(lotId: string, saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const targetSaleNo = str(formData.get("target_sale_no"));
  const sampleKg = Math.max(0, num(formData.get("sample_kg")) || 0);
  const { data: lot } = await supabase
    .from("auction_lots")
    .select("id, sale_id, mark_id, invoice_no, grade, bags, kg_per_bag, net_wt, state, auction_sales(broker_id)")
    .eq("id", lotId).single();
  if (!lot) return back(detail, "Lot not found.");
  if (!["valued", "withdrawn", "catalogued"].includes(lot.state as string))
    return back(detail, "Only an unsold catalogued/valued lot can be re-printed.");
  await supabase.from("auction_lots").update({ state: "re-print" }).eq("id", lotId);
  if (targetSaleNo) {
    const brokerId = (lot.auction_sales as unknown as { broker_id: string } | null)?.broker_id;
    if (brokerId) {
      const { data: ns } = await supabase.from("auction_sales")
        .select("id").eq("broker_id", brokerId).eq("sale_no", targetSaleNo).maybeSingle();
      let nsId = ns?.id as string | undefined;
      if (!nsId) {
        const { data: cr } = await supabase.from("auction_sales")
          .insert({ factory_id: profile.factory_id, broker_id: brokerId, sale_no: targetSaleNo, status: "dispatched" })
          .select("id").single();
        nsId = cr?.id as string;
      }
      if (nsId) {
        const newNet = Number((Number(lot.net_wt) - sampleKg).toFixed(2));
        await supabase.from("auction_lots").insert({
          factory_id: profile.factory_id, sale_id: nsId, mark_id: lot.mark_id,
          invoice_no: lot.invoice_no, grade: lot.grade, bags: lot.bags,
          kg_per_bag: lot.kg_per_bag, net_wt: newNet, state: "invoiced",
        });
      }
    }
  }
  revalidatePath(detail);
  redirect(`${detail}?notice=Lot re-printed.`);
}

export async function addDispatchedLot(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const invoiceNo = str(formData.get("invoice_no"));
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  if (!invoiceNo) back(detail, "Invoice number is required.");
  if (!grade) back(detail, "Grade is required.");
  if (!(bags > 0) || !(kgPerBag > 0)) back(detail, "Bags and kg/bag must be positive.");
  const netWt = Number((bags * kgPerBag).toFixed(2));
  const { error } = await supabase.from("auction_lots").insert({
    factory_id: profile.factory_id, sale_id: saleId, mark_id: str(formData.get("mark_id")) || null,
    invoice_no: invoiceNo, lot_no: str(formData.get("lot_no")) || null,
    grade, bags, kg_per_bag: kgPerBag, net_wt: netWt, state: "invoiced",
  });
  if (error) back(detail, error.message);
  revalidatePath(detail);
  redirect(detail);
}

// Only invoiced/dispatched/pending lots can be removed by hand (to fix entry mistakes).
export async function deleteLot(id: string, saleId: string) {
  const { supabase } = await requireProfile(roles());
  await supabase.from("auction_lots").delete().eq("id", id).in("state", ["invoiced", "dispatched", "pending"]);
  revalidatePath(`${AUC}/${saleId}`);
}
