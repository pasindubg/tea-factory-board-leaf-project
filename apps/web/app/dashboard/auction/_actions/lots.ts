"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/profile";
import { AUC, str, num, back, writeAudit, type Supa } from "./_shared";
import { formatFourDigitNo } from "../sale-number";
import { isLotState } from "../lot-states";

async function ensureDispatchEditable(
  supabase: Supa,
  saleId: string,
  role: string,
  detailPath: string,
) {
  if (role === "owner") return;
  const { data: sale } = await supabase
    .from("auction_sales")
    .select("status")
    .eq("id", saleId)
    .single();
  const status = sale?.status as string | null | undefined;
  if (status !== "draft" && status !== "dispatched") {
    back(detailPath, "Only the owner can edit this dispatch after it is confirmed.");
  }
}

function invoiceNumbers(formData: FormData) {
  return [...new Set(
    formData
      .getAll("invoice_no")
      .map((value) => formatFourDigitNo(str(value)))
      .filter(Boolean),
  )];
}

function sampleAllowance(formData: FormData) {
  return Math.max(0, num(formData.get("sample_allowance")) || 0);
}

function netWeight(bags: number, kgPerBag: number, sampleKg = 0) {
  return Number(Math.max(0, bags * kgPerBag - sampleKg).toFixed(2));
}

async function syncDispatchStatusFromLots(supabase: Supa, saleId: string, factoryId: string) {
  const [{ data: sale }, { data: lots }] = await Promise.all([
    supabase.from("auction_sales").select("status").eq("id", saleId).eq("factory_id", factoryId).maybeSingle(),
    supabase.from("auction_lots").select("state").eq("sale_id", saleId).eq("factory_id", factoryId),
  ]);
  const current = sale?.status as string | null | undefined;
  if (!current || ["catalogued", "settled", "broker_statement"].includes(current)) return;

  const states = (lots ?? []).map((lot) => lot.state as string | null);
  const cataloguedLots = states.filter((state) =>
    ["acknowledged", "pending", "missing", "shutout", "withdrawn", "re-print", "valued", "sold", "settled"].includes(state ?? ""),
  ).length;

  let nextStatus: string | null = null;
  if (cataloguedLots > 0 && ["draft", "dispatched", "grn"].includes(current)) {
    nextStatus = "catalogued";
  }

  if (nextStatus && nextStatus !== current) {
    await supabase.from("auction_sales").update({ status: nextStatus }).eq("id", saleId).eq("factory_id", factoryId);
  }
}

async function ensureInvoiceNumbersUnused(
  supabase: Supa,
  factoryId: string,
  invoices: string[],
  detailPath: string,
  excludeLotId?: string,
) {
  if (invoices.length === 0) return;
  const wanted = new Set(invoices.map(formatFourDigitNo));
  const { data } = await supabase
    .from("lot_invoices")
    .select("invoice_no, lot_id")
    .eq("factory_id", factoryId);
  const conflict = (data ?? []).find(
    (row) => wanted.has(formatFourDigitNo(row.invoice_no as string)) && (!excludeLotId || row.lot_id !== excludeLotId),
  );
  if (conflict) {
    back(detailPath, `Invoice ${conflict.invoice_no as string} is already attached to another dispatch lot.`);
  }
}

async function reusableReprintSourceForInvoices(
  supabase: Supa,
  factoryId: string,
  invoices: string[],
  detailPath: string,
) {
  if (invoices.length === 0) return null;
  const wanted = new Set(invoices.map(formatFourDigitNo));
  const { data: invoiceRows } = await supabase
    .from("lot_invoices")
    .select("invoice_no, lot_id")
    .eq("factory_id", factoryId);
  const conflicts = (invoiceRows ?? []).filter((row) => wanted.has(formatFourDigitNo(row.invoice_no as string)));
  if (conflicts.length === 0) return null;

  const lotIds = [...new Set(conflicts.map((row) => row.lot_id as string).filter(Boolean))];
  const { data: lots } = await supabase
    .from("auction_lots")
    .select("id, state, created_at")
    .in("id", lotIds);
  const rows = (lots ?? []) as { id: string; state: string | null; created_at: string | null }[];
  const blocking = rows.find((lot) => lot.state !== "re-print");
  if (blocking) {
    const conflict = conflicts.find((row) => row.lot_id === blocking.id);
    back(detailPath, `Invoice ${conflict?.invoice_no as string} is already attached to another active dispatch lot.`);
  }

  return rows
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0]?.id ?? null;
}

async function appliedThresholdForLot(
  supabase: Supa,
  factoryId: string,
  saleId: string,
  grade: string,
) {
  const { data: sale } = await supabase
    .from("auction_sales")
    .select("broker_id")
    .eq("id", saleId)
    .eq("factory_id", factoryId)
    .single();
  const brokerId = sale?.broker_id as string | null | undefined;
  if (!brokerId) return null;
  const { data: gradeRow } = await supabase
    .from("auction_grades")
    .select("id")
    .eq("factory_id", factoryId)
    .eq("code", grade)
    .eq("active", true)
    .maybeSingle();
  if (!gradeRow?.id) return null;
  const { data: threshold } = await supabase
    .from("broker_grade_thresholds")
    .select("min_net_kg, applies")
    .eq("factory_id", factoryId)
    .eq("broker_id", brokerId)
    .eq("grade_id", gradeRow.id)
    .maybeSingle();
  if (!threshold?.applies) return null;
  return Number(threshold.min_net_kg ?? 0);
}

export async function updateLot(id: string, saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  await ensureDispatchEditable(supabase, saleId, profile.role, detail);
  const updates: Record<string, string | number | null> = {};
  const invoiceList = invoiceNumbers(formData);
  const invoiceNo = invoiceList[0] ?? "";
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const sampleKg = sampleAllowance(formData);
  const lotNo = formatFourDigitNo(str(formData.get("lot_no")));
  const newState = str(formData.get("state"));
  if (invoiceNo) updates.invoice_no = invoiceNo;
  if (grade) updates.grade = grade;
  // Always update lot_no if present in the form (even if clearing it)
  if (formData.has("lot_no")) updates.lot_no = lotNo || null;
  if (bags > 0 && kgPerBag > 0 && sampleKg >= bags * kgPerBag) {
    back(detail, "Sample weight must be less than the gross lot weight.");
  }
  if (bags > 0) updates.bags = bags;
  if (kgPerBag > 0) updates.kg_per_bag = kgPerBag;
  if (formData.has("sample_allowance")) updates.sample_allowance = sampleKg;
  if (bags > 0 && kgPerBag > 0) updates.net_wt = netWeight(bags, kgPerBag, sampleKg);

  // State override — owners only, for when the PDF parser missed something.
  const isOwner = profile.role === "owner";
  if (newState && isOwner && !isLotState(newState)) {
    back(detail, `Invalid lot state: ${newState}.`);
  }
  if (newState && isOwner && isLotState(newState)) {
    updates.state = newState;
    if (newState === "shutout") updates.shutout_reason = str(formData.get("shutout_reason")) || "Manual override";
    else updates.shutout_reason = null;
  }
  if (!(newState && isOwner) && grade && bags > 0 && kgPerBag > 0) {
    const threshold = await appliedThresholdForLot(supabase, profile.factory_id, saleId, grade);
    const netWt = netWeight(bags, kgPerBag, sampleKg);
    if (threshold != null && threshold > 0 && netWt < threshold) {
      updates.state = "shutout";
      updates.shutout_reason = `Below broker minimum ${threshold.toFixed(2)} kg for ${grade}`;
    }
  }

  if (Object.keys(updates).length === 0) return null;
  if (invoiceNo) {
    await ensureInvoiceNumbersUnused(supabase, profile.factory_id, [invoiceNo], detail, id);
  }
  const { data: updatedLot, error: updateError } = await supabase
    .from("auction_lots")
    .update(updates)
    .eq("id", id)
    .eq("sale_id", saleId)
    .eq("factory_id", profile.factory_id)
    .select("invoice_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state")
    .single();
  if (updateError || !updatedLot) {
    back(detail, `Could not update lot: ${updateError?.message ?? "lot not found"}.`);
  }
  if (invoiceNo) {
    const { data: existingInvoice } = await supabase
      .from("lot_invoices")
      .select("id")
      .eq("lot_id", id)
      .maybeSingle();
    if (existingInvoice?.id) {
      await supabase.from("lot_invoices").update({ invoice_no: invoiceNo }).eq("id", existingInvoice.id);
    } else {
      await supabase.from("lot_invoices").insert({
        factory_id: profile.factory_id,
        lot_id: id,
        invoice_no: invoiceNo,
      });
    }
  }
  await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  revalidatePath(detail);
  return updatedLot;
}

export async function markReprint(lotId: string, saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  await ensureDispatchEditable(supabase, saleId, profile.role, detail);
  const { data: lot } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, state, bags, kg_per_bag, gross_wt, sample_allowance, net_wt")
    .eq("id", lotId).single();
  if (!lot) return back(detail, "Lot not found.");
  if (!["valued", "withdrawn", "acknowledged", "catalogued", "re-print", "sold"].includes(lot.state as string))
    return back(detail, "Only an acknowledged or sales-stage lot can be marked as re-print.");
  const existingSample = Math.max(0, Number(lot.sample_allowance ?? 0));
  const additionalSample = Math.max(0, num(formData.get("additional_sample_kg")) || 0);
  const cumulativeSample = Number((existingSample + additionalSample).toFixed(2));
  const bagGross = Number(lot.bags ?? 0) * Number(lot.kg_per_bag ?? 0);
  const baseGross = Number(lot.gross_wt ?? 0) || bagGross || Number(lot.net_wt ?? 0) + existingSample;
  const nextNet = Number(Math.max(0, baseGross - cumulativeSample).toFixed(2));
  await supabase
    .from("auction_lots")
    .update({ state: "re-print", sample_allowance: cumulativeSample, net_wt: nextNet })
    .eq("id", lotId);
  await writeAudit(supabase, profile.factory_id, {
    saleId,
    lotId,
    action: "Manual re-print",
    detail: `Invoice ${formatFourDigitNo(lot.invoice_no as string)} was manually moved to re-print. An additional ${additionalSample.toFixed(2)} kg sample was deducted; cumulative sample allowance is ${cumulativeSample.toFixed(2)} kg and remaining net weight is ${nextNet.toFixed(2)} kg.`,
    reason: "Owner manually marked the lot for re-print.",
    actor: profile.name,
  });
  await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  revalidatePath(detail);
  revalidatePath(`${AUC}/reprints`);
}

export async function addDispatchedLot(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  await ensureDispatchEditable(supabase, saleId, profile.role, detail);
  const invoiceList = invoiceNumbers(formData);
  const invoiceNo = invoiceList[0] ?? "";
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const sampleKg = sampleAllowance(formData);
  if (!invoiceNo) back(detail, "Invoice number is required.");
  const reprintSourceLotId = await reusableReprintSourceForInvoices(supabase, profile.factory_id, invoiceList, detail);
  if (!grade) back(detail, "Grade is required.");
  if (!(bags > 0) || !(kgPerBag > 0)) back(detail, "Bags and kg/bag must be positive.");
  if (sampleKg >= bags * kgPerBag) back(detail, "Sample weight must be less than the gross lot weight.");
  const netWt = netWeight(bags, kgPerBag, sampleKg);
  const threshold = await appliedThresholdForLot(supabase, profile.factory_id, saleId, grade);
  const isBelowAppliedThreshold = threshold != null && threshold > 0 && netWt < threshold;
  const { data: createdLot, error } = await supabase.from("auction_lots").insert({
    factory_id: profile.factory_id, sale_id: saleId, mark_id: str(formData.get("mark_id")) || null,
    invoice_no: invoiceNo, lot_no: formatFourDigitNo(str(formData.get("lot_no"))) || null,
    grade,
    bags,
    kg_per_bag: kgPerBag,
    sample_allowance: sampleKg,
    net_wt: netWt,
    state: isBelowAppliedThreshold ? "shutout" : "invoiced",
    shutout_reason: isBelowAppliedThreshold ? `Below broker minimum ${threshold.toFixed(2)} kg for ${grade}` : null,
    lot_source: "factory",
    reprint_source_lot_id: reprintSourceLotId,
  }).select("id").single();
  if (error) back(detail, error.message);
  if (createdLot?.id) {
    await supabase.from("lot_invoices").insert(invoiceList.map((invoice) => ({
      factory_id: profile.factory_id,
      lot_id: createdLot.id,
      invoice_no: invoice,
    })));
  }
  await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  revalidatePath(detail);
  return (createdLot?.id as string | undefined) ?? null;
}

// Only invoiced/pending lots can be removed by hand (to fix entry mistakes).
// Lots on a draft dispatch can be removed by any auction role, but only while
// still invoiced/pending (fixing entry mistakes). Once the dispatch is
// confirmed, deletion is OWNER-ONLY and works at any lot lifecycle stage —
// the delete cascades the lot's dependent records (VAT ledger + sale line,
// valuation, invoice records, audit rows) so a wrongly imported lot can be
// cleaned up without leaving orphans.
export async function deleteLot(id: string, saleId: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const { data: lot } = await supabase
    .from("auction_lots")
    .select("id, state, auction_sales(status)")
    .eq("id", id)
    .eq("sale_id", saleId)
    .maybeSingle();
  if (!lot) return;
  const saleStatus = (lot.auction_sales as unknown as { status: string } | null)?.status;
  const isDraft = saleStatus === "draft" || saleStatus === "dispatched";
  const isOwner = profile.role === "owner";
  if (!isDraft && !isOwner) {
    back(detail, "Only the owner can delete lots after the dispatch is confirmed.");
  }
  if (!isOwner && !["invoiced", "pending"].includes(lot.state as string)) {
    back(detail, "Only invoiced/pending lots can be removed.");
  }
  // Cascade dependents before the lot (mirrors deleteSale's ordering).
  const { data: slRows } = await supabase.from("sale_lines").select("id").eq("lot_id", id);
  const slIds = (slRows ?? []).map((s) => s.id as string);
  if (slIds.length > 0) {
    await supabase.from("vat_ledger").delete().in("sale_line_id", slIds);
    await supabase.from("sale_lines").delete().in("id", slIds);
  }
  await supabase.from("valuations").delete().eq("lot_id", id);
  await supabase.from("lot_invoices").delete().eq("lot_id", id);
  await supabase.from("auction_audit").delete().eq("lot_id", id);
  await supabase.from("auction_lots").delete().eq("id", id);
  await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  revalidatePath(detail);
}
