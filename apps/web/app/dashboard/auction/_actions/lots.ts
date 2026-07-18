"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/profile";
import { deleteTenantRow } from "@/lib/tenant-data";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { AUC, str, num, writeAudit, type Supa } from "./_shared";
import { formatFourDigitNo } from "../sale-number";
import { isLotState } from "../lot-states";
import type { LotRow } from "../[saleId]/lot-row";

async function dispatchEditError(
  supabase: Supa,
  saleId: string,
  factoryId: string,
  role: string,
) {
  if (role === "owner") return null;
  const { data: sale, error } = await supabase
    .from("auction_sales")
    .select("status")
    .eq("id", saleId)
    .eq("factory_id", factoryId)
    .maybeSingle();
  if (error) return friendlyError(error);
  const status = sale?.status as string | null | undefined;
  if (status !== "draft" && status !== "dispatched") {
    return "Only the owner can edit this broker invoice after it is confirmed.";
  }
  return null;
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

async function syncDispatchStatusFromLots(supabase: Supa, saleId: string, factoryId: string): Promise<ListMutationResult> {
  const [{ data: sale, error: saleError }, { data: lots, error: lotsError }] = await Promise.all([
    supabase.from("auction_sales").select("status").eq("id", saleId).eq("factory_id", factoryId).maybeSingle(),
    supabase.from("auction_lots").select("state").eq("sale_id", saleId).eq("factory_id", factoryId),
  ]);
  if (saleError || lotsError) return { ok: false, error: friendlyError(saleError ?? lotsError) };
  const current = sale?.status as string | null | undefined;
  if (!current) return { ok: false, error: "Broker Invoice not found while updating its status." };
  if (["catalogued", "settled", "broker_statement"].includes(current)) return { ok: true };

  const states = (lots ?? []).map((lot) => lot.state as string | null);
  const cataloguedLots = states.filter((state) =>
    ["acknowledged", "pending", "missing", "shutout", "not-valued", "withdrawn", "re-print", "valued", "sold", "settled"].includes(state ?? ""),
  ).length;

  let nextStatus: string | null = null;
  if (cataloguedLots > 0 && ["draft", "dispatched", "invoiced", "grn"].includes(current)) {
    nextStatus = "catalogued";
  }

  if (nextStatus && nextStatus !== current) {
    const { data: updated, error: updateError } = await supabase
      .from("auction_sales")
      .update({ status: nextStatus })
      .eq("id", saleId)
      .eq("factory_id", factoryId)
      .select("id")
      .maybeSingle();
    if (updateError) return { ok: false, error: friendlyError(updateError) };
    if (!updated) return { ok: false, error: "Broker Invoice changed before its status could be updated." };
  }
  return { ok: true };
}

async function ensureInvoiceNumbersUnused(
  supabase: Supa,
  factoryId: string,
  invoices: string[],
  excludeLotId?: string,
) {
  if (invoices.length === 0) return null;
  const wanted = new Set(invoices.map(formatFourDigitNo));
  const { data, error } = await supabase
    .from("lot_invoices")
    .select("invoice_no, lot_id")
    .eq("factory_id", factoryId);
  if (error) return friendlyError(error);
  const conflict = (data ?? []).find(
    (row) => wanted.has(formatFourDigitNo(row.invoice_no as string)) && (!excludeLotId || row.lot_id !== excludeLotId),
  );
  if (conflict) {
    return `Invoice ${conflict.invoice_no as string} is already attached to another broker invoice.`;
  }
  return null;
}

async function reusableReprintSourceForInvoices(
  supabase: Supa,
  factoryId: string,
  invoices: string[],
): Promise<{ ok: true; sourceLotId: string | null } | { ok: false; error: string }> {
  if (invoices.length === 0) return { ok: true, sourceLotId: null };
  const wanted = new Set(invoices.map(formatFourDigitNo));
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("lot_invoices")
    .select("invoice_no, lot_id")
    .eq("factory_id", factoryId);
  if (invoiceError) return { ok: false, error: friendlyError(invoiceError) };
  const conflicts = (invoiceRows ?? []).filter((row) => wanted.has(formatFourDigitNo(row.invoice_no as string)));
  if (conflicts.length === 0) return { ok: true, sourceLotId: null };

  const lotIds = [...new Set(conflicts.map((row) => row.lot_id as string).filter(Boolean))];
  const { data: lots, error: lotsError } = await supabase
    .from("auction_lots")
    .select("id, state, created_at")
    .eq("factory_id", factoryId)
    .in("id", lotIds);
  if (lotsError) return { ok: false, error: friendlyError(lotsError) };
  const rows = (lots ?? []) as { id: string; state: string | null; created_at: string | null }[];
  const blocking = rows.find((lot) => lot.state !== "re-print");
  if (blocking) {
    const conflict = conflicts.find((row) => row.lot_id === blocking.id);
    return { ok: false, error: `Invoice ${conflict?.invoice_no as string} is already attached to another active broker invoice.` };
  }

  return {
    ok: true,
    sourceLotId: rows
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0]?.id ?? null,
  };
}

async function appliedThresholdForLot(
  supabase: Supa,
  factoryId: string,
  saleId: string,
  grade: string,
) : Promise<{ ok: true; threshold: number | null } | { ok: false; error: string }> {
  const { data: sale, error: saleError } = await supabase
    .from("auction_sales")
    .select("broker_id")
    .eq("id", saleId)
    .eq("factory_id", factoryId)
    .single();
  if (saleError) return { ok: false, error: friendlyError(saleError) };
  const brokerId = sale?.broker_id as string | null | undefined;
  if (!brokerId) return { ok: false, error: "Broker Invoice has no broker for threshold validation." };
  const { data: gradeRow, error: gradeError } = await supabase
    .from("auction_grades")
    .select("id")
    .eq("factory_id", factoryId)
    .eq("code", grade)
    .eq("active", true)
    .maybeSingle();
  if (gradeError) return { ok: false, error: friendlyError(gradeError) };
  if (!gradeRow?.id) return { ok: true, threshold: null };
  const { data: threshold, error: thresholdError } = await supabase
    .from("broker_grade_thresholds")
    .select("min_net_kg, applies")
    .eq("factory_id", factoryId)
    .eq("broker_id", brokerId)
    .eq("grade_id", gradeRow.id)
    .maybeSingle();
  if (thresholdError) return { ok: false, error: friendlyError(thresholdError) };
  if (!threshold?.applies) return { ok: true, threshold: null };
  return { ok: true, threshold: Number(threshold.min_net_kg ?? 0) };
}

type SavedLotPatch = Pick<LotRow, "invoice_no" | "lot_no" | "grade" | "bags" | "kg_per_bag" | "sample_allowance" | "net_wt" | "state">;

export type UpdateLotResult =
  | { ok: true; row: SavedLotPatch; notice: string }
  | { ok: false; error: string };

export async function updateLot(id: string, saleId: string, formData: FormData): Promise<UpdateLotResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const editError = await dispatchEditError(supabase, saleId, profile.factory_id, profile.role);
  if (editError) return { ok: false, error: editError };
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
    return { ok: false, error: "Sample weight must be less than the gross lot weight." };
  }
  if (bags > 0) updates.bags = bags;
  if (kgPerBag > 0) updates.kg_per_bag = kgPerBag;
  if (formData.has("sample_allowance")) updates.sample_allowance = sampleKg;
  if (bags > 0 && kgPerBag > 0) updates.net_wt = netWeight(bags, kgPerBag, sampleKg);

  // State override — owners only, for when the PDF parser missed something.
  const isOwner = profile.role === "owner";
  if (newState && isOwner && !isLotState(newState)) {
    return { ok: false, error: `Invalid lot state: ${newState}.` };
  }
  if (newState && isOwner && isLotState(newState)) {
    updates.state = newState;
    if (newState === "shutout") updates.shutout_reason = str(formData.get("shutout_reason")) || "Manual override";
    else updates.shutout_reason = null;
  }
  if (!(newState && isOwner) && grade && bags > 0 && kgPerBag > 0) {
    const thresholdResult = await appliedThresholdForLot(supabase, profile.factory_id, saleId, grade);
    if (!thresholdResult.ok) return thresholdResult;
    const threshold = thresholdResult.threshold;
    const netWt = netWeight(bags, kgPerBag, sampleKg);
    if (threshold != null && threshold > 0 && netWt < threshold) {
      updates.state = "shutout";
      updates.shutout_reason = `Below broker minimum ${threshold.toFixed(2)} kg for ${grade}`;
    }
  }

  if (Object.keys(updates).length === 0) return { ok: false, error: "No lot changes were supplied." };
  if (invoiceNo) {
    const invoiceConflict = await ensureInvoiceNumbersUnused(supabase, profile.factory_id, [invoiceNo], id);
    if (invoiceConflict) return { ok: false, error: invoiceConflict };
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
    return { ok: false, error: `Could not update lot: ${updateError ? friendlyError(updateError) : "lot not found"}.` };
  }
  if (invoiceNo) {
    const { data: existingInvoice, error: invoiceReadError } = await supabase
      .from("lot_invoices")
      .select("id")
      .eq("lot_id", id)
      .eq("factory_id", profile.factory_id)
      .maybeSingle();
    if (invoiceReadError) return { ok: false, error: friendlyError(invoiceReadError) };
    if (existingInvoice?.id) {
      const { error: invoiceUpdateError } = await supabase.from("lot_invoices").update({ invoice_no: invoiceNo }).eq("id", existingInvoice.id).eq("factory_id", profile.factory_id);
      if (invoiceUpdateError) return { ok: false, error: friendlyError(invoiceUpdateError) };
    } else {
      const { error: invoiceInsertError } = await supabase.from("lot_invoices").insert({
        factory_id: profile.factory_id,
        lot_id: id,
        invoice_no: invoiceNo,
      });
      if (invoiceInsertError) return { ok: false, error: friendlyError(invoiceInsertError) };
    }
  }
  const synced = await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  if (!synced.ok) return synced;
  return {
    ok: true,
    notice: "Lot updated.",
    row: {
      invoice_no: updatedLot.invoice_no as string | null,
      lot_no: updatedLot.lot_no as string | null,
      grade: updatedLot.grade as string | null,
      bags: updatedLot.bags as number | null,
      kg_per_bag: updatedLot.kg_per_bag as number | null,
      sample_allowance: updatedLot.sample_allowance as string | number | null,
      net_wt: updatedLot.net_wt as string | number | null,
      state: updatedLot.state as string | null,
    },
  };
}

export type MarkReprintResult =
  | { ok: true; row: Pick<LotRow, "state" | "sample_allowance" | "net_wt">; notice: string }
  | { ok: false; error: string };

export async function markReprint(lotId: string, saleId: string, formData: FormData): Promise<MarkReprintResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const editError = await dispatchEditError(supabase, saleId, profile.factory_id, profile.role);
  if (editError) return { ok: false, error: editError };
  const { data: lot, error: lotError } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, state, bags, kg_per_bag, gross_wt, sample_allowance, net_wt")
    .eq("id", lotId)
    .eq("sale_id", saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: "Lot not found." };
  if (!["valued", "withdrawn", "acknowledged", "catalogued", "re-print", "sold"].includes(lot.state as string))
    return { ok: false, error: "Only an acknowledged or sales-stage lot can be marked as re-print." };
  const existingSample = Math.max(0, Number(lot.sample_allowance ?? 0));
  const additionalSample = Math.max(0, num(formData.get("additional_sample_kg")) || 0);
  const cumulativeSample = Number((existingSample + additionalSample).toFixed(2));
  const bagGross = Number(lot.bags ?? 0) * Number(lot.kg_per_bag ?? 0);
  const baseGross = Number(lot.gross_wt ?? 0) || bagGross || Number(lot.net_wt ?? 0) + existingSample;
  const nextNet = Number(Math.max(0, baseGross - cumulativeSample).toFixed(2));
  const { data: updatedLot, error: updateError } = await supabase
    .from("auction_lots")
    .update({ state: "re-print", sample_allowance: cumulativeSample, net_wt: nextNet })
    .eq("id", lotId)
    .eq("sale_id", saleId)
    .eq("factory_id", profile.factory_id)
    .select("state, sample_allowance, net_wt")
    .maybeSingle();
  if (updateError || !updatedLot) return { ok: false, error: updateError ? friendlyError(updateError) : "Lot not found." };
  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId,
    lotId,
    action: "Manual re-print",
    detail: `Invoice ${formatFourDigitNo(lot.invoice_no as string)} was manually moved to re-print. An additional ${additionalSample.toFixed(2)} kg sample was deducted; cumulative sample allowance is ${cumulativeSample.toFixed(2)} kg and remaining net weight is ${nextNet.toFixed(2)} kg.`,
    reason: "Owner manually marked the lot for re-print.",
    actor: profile.name,
  });
  if (auditError) {
    const { error: rollbackError } = await supabase
      .from("auction_lots")
      .update({ state: lot.state, sample_allowance: lot.sample_allowance, net_wt: lot.net_wt })
      .eq("id", lotId)
      .eq("sale_id", saleId)
      .eq("factory_id", profile.factory_id)
      .eq("state", "re-print");
    if (rollbackError) return { ok: false, error: "The lot was marked for re-print, but its audit entry could not be saved. Review this broker invoice before retrying." };
    return { ok: false, error: friendlyError(auditError) };
  }
  const synced = await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  if (!synced.ok) return synced;
  revalidatePath(`${AUC}/reprints`);
  return {
    ok: true,
    notice: "Lot marked as re-print.",
    row: {
      state: updatedLot.state as string | null,
      sample_allowance: updatedLot.sample_allowance as string | number | null,
      net_wt: updatedLot.net_wt as string | number | null,
    },
  };
}

/** Registers a pre-existing lot as the root of a historic re-print chain.
 * A later broker-invoice lot using the same invoice number will link to it via
 * the normal re-print source resolver. */
export async function registerHistoricReprint(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  if (profile.role !== "owner") return { ok: false, error: "Only the owner can register a historic re-print." };

  const lotId = str(formData.get("lot_id"));
  const additionalSample = Math.max(0, num(formData.get("additional_sample_kg")) || 0);
  const reason = str(formData.get("reason")) || "Historic re-print entered manually.";
  if (!lotId) return { ok: false, error: "Select the historic lot to register." };

  const { data: lot, error: lotError } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, state, bags, kg_per_bag, gross_wt, sample_allowance, net_wt, reprint_source_lot_id, sale_lines(id)")
    .eq("id", lotId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: "The selected historic lot was not found." };
  const invoiceNo = formatFourDigitNo(lot.invoice_no as string | null);
  if (!invoiceNo) return { ok: false, error: "A historic re-print needs an invoice number so its later reuse can be linked." };
  if (lot.reprint_source_lot_id) return { ok: false, error: "This lot is already part of a re-print chain." };
  if (!['acknowledged', 'catalogued', 'valued', 'withdrawn'].includes(lot.state as string)) {
    return { ok: false, error: "Only an acknowledged, valued, or withdrawn lot can be registered as a historic re-print." };
  }
  if (((lot.sale_lines as unknown as { id: string }[] | null) ?? []).length > 0) {
    return { ok: false, error: "A lot with a recorded sale cannot be registered as a re-print." };
  }

  const existingSample = Math.max(0, Number(lot.sample_allowance ?? 0));
  const cumulativeSample = Number((existingSample + additionalSample).toFixed(2));
  const bagGross = Number(lot.bags ?? 0) * Number(lot.kg_per_bag ?? 0);
  const baseGross = Number(lot.gross_wt ?? 0) || bagGross || Number(lot.net_wt ?? 0) + existingSample;
  const nextNet = Number(Math.max(0, baseGross - cumulativeSample).toFixed(2));
  const { data: updatedLot, error: updateError } = await supabase
    .from("auction_lots")
    .update({ state: "re-print", sample_allowance: cumulativeSample, net_wt: nextNet })
    .eq("id", lot.id)
    .eq("sale_id", lot.sale_id)
    .eq("factory_id", profile.factory_id)
    .eq("state", lot.state as string)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, error: friendlyError(updateError) };
  if (!updatedLot) return { ok: false, error: "The historic lot changed before it could be registered as a re-print." };

  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId: lot.sale_id as string,
    lotId: lot.id as string,
    action: "Historic manual re-print",
    detail: `Invoice ${invoiceNo} was registered as a historic re-print. Sample allowance is ${cumulativeSample.toFixed(2)} kg and remaining net weight is ${nextNet.toFixed(2)} kg.`,
    reason,
    actor: profile.name,
  });
  if (auditError) {
    const { error: rollbackError } = await supabase
      .from("auction_lots")
      .update({ state: lot.state, sample_allowance: lot.sample_allowance, net_wt: lot.net_wt })
      .eq("id", lot.id)
      .eq("sale_id", lot.sale_id)
      .eq("factory_id", profile.factory_id)
      .eq("state", "re-print");
    if (rollbackError) return { ok: false, error: "The historic re-print was saved but its audit entry could not be created. Review the Broker Invoice before retrying." };
    return { ok: false, error: friendlyError(auditError) };
  }

  revalidatePath(`${AUC}/reprints`);
  return {
    ok: true,
    notice: `Invoice ${invoiceNo} registered as a historic re-print.`,
    invalidate: [
      { kind: "all", key: "auction.reprint-overview" },
      { kind: "exact", resource: { key: "auction.dispatch-lots", params: { saleId: lot.sale_id as string } } },
    ],
  };
}

export type CreateDispatchedLotResult =
  | { ok: true; row: LotRow; notice: string }
  | { ok: false; error: string };

/** List-local create command. It returns the canonical saved row so the lot
 * list can update itself without an optimistic placeholder or route refresh. */
export async function createDispatchedLotForList(saleId: string, formData: FormData): Promise<CreateDispatchedLotResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const invoiceList = invoiceNumbers(formData);
  const invoiceNo = invoiceList[0] ?? "";
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const sampleKg = sampleAllowance(formData);
  if (!invoiceNo) return { ok: false, error: "Invoice number is required." };
  if (!grade) return { ok: false, error: "Grade is required." };
  if (!(bags > 0) || !(kgPerBag > 0)) return { ok: false, error: "Bags and kg/bag must be positive." };
  if (sampleKg >= bags * kgPerBag) return { ok: false, error: "Sample weight must be less than the gross lot weight." };
  const reprintSource = await reusableReprintSourceForInvoices(supabase, profile.factory_id, invoiceList);
  if (!reprintSource.ok) return reprintSource;
  const netWt = netWeight(bags, kgPerBag, sampleKg);
  const thresholdResult = await appliedThresholdForLot(supabase, profile.factory_id, saleId, grade);
  if (!thresholdResult.ok) return thresholdResult;
  const threshold = thresholdResult.threshold;
  const { data: brokerInvoice, error: brokerInvoiceError } = await supabase
    .from("auction_sales")
    .select("target_sale_no, selling_mark_id, status")
    .eq("id", saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (brokerInvoiceError) return { ok: false, error: friendlyError(brokerInvoiceError) };
  if (!brokerInvoice) return { ok: false, error: "Broker Invoice not found." };
  if (profile.role !== "owner" && !["draft", "dispatched"].includes(brokerInvoice.status as string)) {
    return { ok: false, error: "Only the owner can edit this broker invoice after it is confirmed." };
  }
  const sellingMarkId = brokerInvoice.selling_mark_id as string | null;
  if (!sellingMarkId) return { ok: false, error: "Assign a selling mark to the Broker Invoice before adding lots." };
  const isBelowAppliedThreshold = threshold != null && threshold > 0 && netWt < threshold;
  const { data: createdLot, error } = await supabase.from("auction_lots").insert({
    factory_id: profile.factory_id, sale_id: saleId, mark_id: sellingMarkId,
    invoice_no: invoiceNo, lot_no: formatFourDigitNo(str(formData.get("lot_no"))) || null,
    provisional_sale_no: (brokerInvoice.target_sale_no as string | null) ?? null,
    grade,
    bags,
    kg_per_bag: kgPerBag,
    sample_allowance: sampleKg,
    net_wt: netWt,
    state: isBelowAppliedThreshold ? "shutout" : "invoiced",
    shutout_reason: isBelowAppliedThreshold ? `Below broker minimum ${threshold.toFixed(2)} kg for ${grade}` : null,
    lot_source: "factory",
    reprint_source_lot_id: reprintSource.sourceLotId,
  }).select("id, invoice_no, provisional_sale_no, final_sale_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, shutout_reason, lot_source").single();
  if (error || !createdLot) return { ok: false, error: friendlyError(error ?? { message: "Could not create the lot." }) };
  const { error: invoiceInsertError } = await supabase.from("lot_invoices").insert(invoiceList.map((invoice) => ({
    factory_id: profile.factory_id,
    lot_id: createdLot.id,
    invoice_no: invoice,
  })));
  if (invoiceInsertError) {
    const rollback = await deleteTenantRow(supabase, "auction_lots", createdLot.id as string);
    if (rollback.error) {
      return {
        ok: false,
        error: "The lot invoices could not be saved, and the temporary lot could not be cleaned up. Refresh and review the lot list before retrying.",
      };
    }
    return { ok: false, error: friendlyError(invoiceInsertError) };
  }
  const synced = await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  if (!synced.ok) return synced;
  return {
    ok: true,
    notice: "Lot added.",
    row: {
      id: createdLot.id as string,
      invoice_no: formatFourDigitNo(createdLot.invoice_no as string | null) || null,
      provisional_sale_no: formatFourDigitNo(createdLot.provisional_sale_no as string | null) || null,
      final_sale_no: formatFourDigitNo(createdLot.final_sale_no as string | null) || null,
      lot_no: formatFourDigitNo(createdLot.lot_no as string | null) || null,
      grade: createdLot.grade as string | null,
      bags: createdLot.bags as number | null,
      kg_per_bag: createdLot.kg_per_bag as number | null,
      sample_allowance: createdLot.sample_allowance as string | number | null,
      net_wt: createdLot.net_wt as string | number | null,
      state: createdLot.state as string | null,
      shutout_reason: createdLot.shutout_reason as string | null,
      lot_source: createdLot.lot_source as string | null,
      reprint_target_sale_id: null,
      reprint_target_label: null,
      threshold_min_net_kg: threshold,
      threshold_applies: threshold != null,
      marks: null,
      lot_invoices: invoiceList.map((invoice) => ({ invoice_no: invoice })),
    },
  };
}

// Only invoiced/pending lots can be removed by hand (to fix entry mistakes).
// Lots on a draft broker invoice can be removed by any auction role, but only while
// still invoiced/pending (fixing entry mistakes). Once the broker invoice is
// confirmed, the delete command is OWNER-ONLY. PostgreSQL cascades only wholly
// owned operational rows (invoice aliases and valuation); financial sale/VAT
// history remains restrictive and returns a dependent-record error.
export async function deleteLot(id: string, saleId: string): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { data: lot, error: lotError } = await supabase
    .from("auction_lots")
    .select("id, state, auction_sales(status)")
    .eq("id", id)
    .eq("sale_id", saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: "Lot not found." };
  const saleStatus = (lot.auction_sales as unknown as { status: string } | null)?.status;
  const isDraft = saleStatus === "draft" || saleStatus === "dispatched";
  const isOwner = profile.role === "owner";
  if (!isDraft && !isOwner) {
    return { ok: false, error: "Only the owner can delete lots after the broker invoice is confirmed." };
  }
  if (!isOwner && !["invoiced", "pending"].includes(lot.state as string)) {
    return { ok: false, error: "Only invoiced/pending lots can be removed." };
  }
  const { error: deleteError } = await deleteTenantRow(supabase, "auction_lots", id);
  if (deleteError) return { ok: false, error: deleteError };
  const synced = await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  if (!synced.ok) return synced;
  return { ok: true, notice: "Lot deleted." };
}
