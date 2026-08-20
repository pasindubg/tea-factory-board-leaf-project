"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/profile";
import { deleteTenantRow } from "@/lib/tenant-data";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { invoiceMatchKey } from "@tea/api";
import { AUC, str, num, writeAudit, gradeRulesByCode, nextDispatchNo, notAnExisting, saleGroupIds, unsoldBlockedReason, type Supa } from "./_shared";
import { formatFourDigitNo, formatSaleNo, saleNoKey, saleNoMatches } from "../sale-number";
import { isLotState } from "../lot-states";
import type { LotRow } from "../[saleId]/lot-row";
import { buildCompositeInvoiceNo, invoiceSeqOf, parseCompositeInvoiceNo, resolveInvoicePrefix } from "../invoice-number";
import { resolveBrokerInvoiceForLot } from "./sales";

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
    ["acknowledged", "valued", "sold"].includes(state ?? ""),
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
    .select("id, state, unsold, reprint, created_at")
    .eq("factory_id", factoryId)
    .in("id", lotIds);
  if (lotsError) return { ok: false, error: friendlyError(lotsError) };
  const rows = (lots ?? []) as { id: string; state: string | null; unsold: boolean | null; reprint: boolean | null; created_at: string | null }[];
  const blocking = rows.find((lot) => !lot.unsold && !lot.reprint);
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
  | { ok: true; row: SavedLotPatch; notice: string; invalidate?: Extract<ListMutationResult, { ok: true }>["invalidate"] }
  | { ok: false; error: string };

export async function updateLot(id: string, saleId: string, formData: FormData): Promise<UpdateLotResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const editError = await dispatchEditError(supabase, saleId, profile.factory_id, profile.role);
  if (editError) return { ok: false, error: editError };
  const updates: Record<string, string | number | boolean | null> = {};
  const rawInvoiceList = invoiceNumbers(formData);
  const rawInvoiceNo = rawInvoiceList[0] ?? "";
  let invoiceNo = "";
  if (rawInvoiceNo) {
    const requestedPrefixId = str(formData.get("prefix_id")) || undefined;
    // Honour the prefix the user typed into the number itself — this screen
    // has no prefix picker, so it is the only way they can express one.
    const requestedPrefix = parseCompositeInvoiceNo(rawInvoiceNo)?.prefix;
    const prefixResult = await resolveInvoicePrefix({
      supabase, factoryId: profile.factory_id, category: "regular_invoice", role: profile.role, requestedPrefixId, requestedPrefix,
    });
    if (!prefixResult.ok) return { ok: false, error: prefixResult.error };
    if (prefixResult.needsApproval) {
      return {
        ok: false,
        error: "That prefix isn't the active one for regular invoices. Only owner, manager, or supervisor can assign an abnormal prefix directly — use the New lot flow for a supervisor-approved entry instead.",
      };
    }
    // invoiceSeqOf strips any prefix the edit form pre-filled, so re-saving a
    // lot cannot compose "26I01-26I01-0003".
    invoiceNo = buildCompositeInvoiceNo(prefixResult.prefix.prefix, invoiceSeqOf(rawInvoiceNo));
  }
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const sampleKg = sampleAllowance(formData);
  const lotNo = formatFourDigitNo(str(formData.get("lot_no")));
  const newState = str(formData.get("state"));
  // The Invoice Overview "Sale No." column shows the parent broker invoice's
  // own target_sale_no (every lot under it shares the one value — see
  // auction.invoice-overview in list-resource-registry.ts), so editing it here
  // writes through to auction_sales rather than this lot row.
  const targetSaleNoRaw = formData.has("target_sale_no") ? formatSaleNo(str(formData.get("target_sale_no"))) : null;
  if (formData.has("target_sale_no") && !targetSaleNoRaw) return { ok: false, error: "Sale number is required." };
  if (invoiceNo) updates.invoice_no = invoiceNo;
  if (grade) updates.grade = grade;
  // Always update lot_no if present in the form (even if clearing it)
  if (formData.has("lot_no")) updates.lot_no = lotNo || null;
  if (bags > 0 && kgPerBag > 0 && sampleKg >= bags * kgPerBag) {
    return { ok: false, error: "Sample weight must be less than the gross lot weight." };
  }
  if (grade) {
    const rule = (await gradeRulesByCode(supabase, profile.factory_id, [grade])).get(grade);
    // The foreign key would reject this too, but only the caller knows which
    // value was typed — see gradeRulesByCode.
    if (!rule) return { ok: false, error: notAnExisting(grade, "tea grade") };
    const minKgPerBag = rule.minKgPerBag;
    if (kgPerBag > 0 && minKgPerBag != null && minKgPerBag > 0 && kgPerBag < minKgPerBag) {
      return { ok: false, error: `kg/bag for grade ${grade} must be at least ${minKgPerBag.toFixed(2)} kg (factory minimum).` };
    }
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
  }
  if (isOwner && formData.has("shutout")) {
    const shutout = str(formData.get("shutout")) === "true";
    updates.shutout = shutout;
    updates.shutout_reason = shutout ? str(formData.get("shutout_reason")) || "Manual override" : null;
  }
  for (const flag of ["unsold", "reprint", "withdrawn", "not_valued", "missing", "settled"] as const) {
    if (isOwner && formData.has(flag)) updates[flag] = str(formData.get(flag)) === "true";
  }
  if (!(newState && isOwner) && grade && bags > 0 && kgPerBag > 0) {
    const thresholdResult = await appliedThresholdForLot(supabase, profile.factory_id, saleId, grade);
    if (!thresholdResult.ok) return thresholdResult;
    const threshold = thresholdResult.threshold;
    const netWt = netWeight(bags, kgPerBag, sampleKg);
    if (threshold != null && threshold > 0 && netWt < threshold) {
      updates.shutout = true;
      updates.shutout_reason = `Below broker minimum ${threshold.toFixed(2)} kg for ${grade}`;
    }
  }

  if (Object.keys(updates).length === 0 && targetSaleNoRaw == null) {
    return { ok: false, error: "No lot changes were supplied." };
  }
  if (invoiceNo) {
    const invoiceConflict = await ensureInvoiceNumbersUnused(supabase, profile.factory_id, [invoiceNo], id);
    if (invoiceConflict) return { ok: false, error: invoiceConflict };
  }
  const lotSelect = "invoice_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state";
  const { data: updatedLot, error: updateError } = Object.keys(updates).length > 0
    ? await supabase
      .from("auction_lots")
      .update(updates)
      .eq("id", id)
      .eq("sale_id", saleId)
      .eq("factory_id", profile.factory_id)
      .select(lotSelect)
      .single()
    : await supabase
      .from("auction_lots")
      .select(lotSelect)
      .eq("id", id)
      .eq("sale_id", saleId)
      .eq("factory_id", profile.factory_id)
      .single();
  if (updateError || !updatedLot) {
    return { ok: false, error: `Could not update lot: ${updateError ? friendlyError(updateError) : "lot not found"}.` };
  }
  if (targetSaleNoRaw) {
    const { data: updatedSale, error: saleUpdateError } = await supabase
      .from("auction_sales")
      .update({ target_sale_no: targetSaleNoRaw })
      .eq("id", saleId)
      .eq("factory_id", profile.factory_id)
      .select("id")
      .maybeSingle();
    if (saleUpdateError) return { ok: false, error: friendlyError(saleUpdateError) };
    if (!updatedSale) return { ok: false, error: "Broker invoice not found." };
    // Lots that already have a final_sale_no carry an authoritative reconciled
    // assignment — this edit must not silently overwrite it, matching
    // updateSale's identical rule in _actions/sales.ts.
    const { error: lotCascadeError } = await supabase
      .from("auction_lots")
      .update({ provisional_sale_no: targetSaleNoRaw })
      .eq("sale_id", saleId)
      .eq("factory_id", profile.factory_id)
      .is("final_sale_no", null);
    if (lotCascadeError) return { ok: false, error: friendlyError(lotCascadeError) };
    revalidatePath(`${AUC}/${saleId}`);
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
    invalidate: OVERVIEW_INVALIDATION(saleId),
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
    .select("id, invoice_no, state, unsold, bags, kg_per_bag, gross_wt, sample_allowance, net_wt")
    .eq("id", lotId)
    .eq("sale_id", saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: "Lot not found." };
  if (!["acknowledged", "valued", "sold"].includes(lot.state as string))
    return { ok: false, error: "Only an acknowledged or sales-stage lot can be marked un-sold." };
  const contractBlocked = await unsoldBlockedReason(supabase, profile.factory_id, saleId);
  if (contractBlocked) return { ok: false, error: contractBlocked };
  const existingSample = Math.max(0, Number(lot.sample_allowance ?? 0));
  const additionalSample = Math.max(0, num(formData.get("additional_sample_kg")) || 0);
  const cumulativeSample = Number((existingSample + additionalSample).toFixed(2));
  const bagGross = Number(lot.bags ?? 0) * Number(lot.kg_per_bag ?? 0);
  const baseGross = Number(lot.gross_wt ?? 0) || bagGross || Number(lot.net_wt ?? 0) + existingSample;
  const nextNet = Number(Math.max(0, baseGross - cumulativeSample).toFixed(2));
  const { data: updatedLot, error: updateError } = await supabase
    .from("auction_lots")
    .update({ unsold: true, sample_allowance: cumulativeSample, net_wt: nextNet })
    .eq("id", lotId)
    .eq("sale_id", saleId)
    .eq("factory_id", profile.factory_id)
    .select("state, sample_allowance, net_wt")
    .maybeSingle();
  if (updateError || !updatedLot) return { ok: false, error: updateError ? friendlyError(updateError) : "Lot not found." };
  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId,
    lotId,
    action: "Manual un-sold",
    detail: `Invoice ${formatFourDigitNo(lot.invoice_no as string)} was manually marked un-sold. An additional ${additionalSample.toFixed(2)} kg sample was deducted; cumulative sample allowance is ${cumulativeSample.toFixed(2)} kg and remaining net weight is ${nextNet.toFixed(2)} kg.`,
    reason: "Owner manually marked the lot un-sold.",
    actor: profile.name,
  });
  if (auditError) {
    const { error: rollbackError } = await supabase
      .from("auction_lots")
      .update({ unsold: lot.unsold, sample_allowance: lot.sample_allowance, net_wt: lot.net_wt })
      .eq("id", lotId)
      .eq("sale_id", saleId)
      .eq("factory_id", profile.factory_id)
      .eq("unsold", true);
    if (rollbackError) return { ok: false, error: "The lot was marked un-sold, but its audit entry could not be saved. Review this broker invoice before retrying." };
    return { ok: false, error: friendlyError(auditError) };
  }
  const synced = await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  if (!synced.ok) return synced;
  revalidatePath(`${AUC}/reprints`);
  return {
    ok: true,
    notice: "Lot marked un-sold.",
    row: {
      state: updatedLot.state as string | null,
      sample_allowance: updatedLot.sample_allowance as string | number | null,
      net_wt: updatedLot.net_wt as string | number | null,
    },
  };
}

/**
 * Declares an unexpected acknowledgement lot to BE a re-print.
 *
 * An invoice the broker catalogued that this system has no record of is not
 * evidence of a re-print — the operator is. When they know which sale it was
 * first offered in, that sale's lot is created here so the chain reads the same
 * way as one the documents produced; when they don't, the lot is simply flagged.
 */
export async function registerLotReprint(saleId: string, invoiceNo: string, formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  if (profile.role !== "owner") return { ok: false, error: "Only the owner can register a re-print." };

  const { data: invoice, error: invoiceError } = await supabase
    .from("auction_sales")
    .select("id, broker_id, sale_no, target_sale_no")
    .eq("id", saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (invoiceError) return { ok: false, error: friendlyError(invoiceError) };
  if (!invoice) return { ok: false, error: "Broker invoice not found." };

  const matchKey = invoiceMatchKey(invoiceNo);
  const { data: brokerLots, error: brokerLotsError } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, grade, bags, kg_per_bag, gross_wt, sample_allowance, net_wt, reprint, auction_sales!inner(broker_id)")
    .eq("factory_id", profile.factory_id)
    .eq("auction_sales.broker_id", invoice.broker_id as string);
  if (brokerLotsError) return { ok: false, error: friendlyError(brokerLotsError) };
  const sameInvoice = (brokerLots ?? []).filter((row) => invoiceMatchKey(row.invoice_no as string) === matchKey);
  const groupIds = await saleGroupIds(supabase, profile.factory_id, saleId);
  // The lot this sale's acknowledgement created, if it has been confirmed yet.
  const currentLot = sameInvoice.find((row) => groupIds.includes(row.sale_id as string));
  if (currentLot?.reprint) return { ok: false, error: "This invoice is already registered as a re-print." };

  const firstSaleNo = formatSaleNo(str(formData.get("first_sale_no")));
  const grade = currentLot?.grade ?? str(formData.get("grade"));
  const netWt = Number(currentLot?.net_wt ?? num(formData.get("net_wt")) ?? 0);
  if (!grade) return { ok: false, error: "The acknowledgement row has no grade to register." };

  // An earlier lot for this invoice IS the re-print source — never create a second.
  let sourceLotId = sameInvoice.find((row) => !groupIds.includes(row.sale_id as string))?.id as string | undefined;

  if (!sourceLotId) {
    const { data: brokerInvoices, error: brokerInvoiceError } = await supabase
      .from("auction_sales")
      .select("id, sale_no, target_sale_no, entry_source")
      .eq("factory_id", profile.factory_id)
      .eq("sale_kind", "dispatch")
      .eq("broker_id", invoice.broker_id as string);
    if (brokerInvoiceError) return { ok: false, error: friendlyError(brokerInvoiceError) };
    let sourceSaleId = (brokerInvoices ?? []).find((row) =>
      firstSaleNo
        ? saleNoMatches((row.target_sale_no as string | null) || (row.sale_no as string | null), firstSaleNo)
        : row.entry_source === "reprint-register" && !row.target_sale_no,
    )?.id as string | undefined;

    if (!sourceSaleId) {
      const prefix = parseCompositeInvoiceNo(invoice.sale_no as string | null)?.prefix;
      if (!prefix) return { ok: false, error: "This broker invoice has no number prefix to open the earlier sale under." };
      const { data: createdInvoice, error: createInvoiceError } = await supabase
        .from("auction_sales")
        .insert({
          factory_id: profile.factory_id,
          broker_id: invoice.broker_id,
          sale_no: await nextDispatchNo(supabase, profile.factory_id, prefix),
          target_sale_no: firstSaleNo || null,
          sale_kind: "dispatch",
          status: "invoiced",
          entry_source: "reprint-register",
        })
        .select("id")
        .single();
      if (createInvoiceError || !createdInvoice) return { ok: false, error: friendlyError(createInvoiceError ?? { message: "Could not open the earlier sale." }) };
      sourceSaleId = createdInvoice.id as string;
    }

    const { data: sourceLot, error: sourceLotError } = await supabase
      .from("auction_lots")
      .insert({
        factory_id: profile.factory_id,
        sale_id: sourceSaleId,
        invoice_no: currentLot?.invoice_no ?? formatFourDigitNo(invoiceNo),
        provisional_sale_no: firstSaleNo || null,
        grade,
        bags: currentLot?.bags ?? null,
        kg_per_bag: currentLot?.kg_per_bag ?? null,
        gross_wt: currentLot?.gross_wt ?? null,
        sample_allowance: currentLot?.sample_allowance ?? null,
        net_wt: netWt,
        state: "invoiced",
        reprint: true,
        reprint_registered: true,
        lot_source: "acknowledgement",
      })
      .select("id")
      .single();
    if (sourceLotError || !sourceLot) return { ok: false, error: friendlyError(sourceLotError ?? { message: "Could not create the earlier sale's lot." }) };
    sourceLotId = sourceLot.id as string;
  }

  if (currentLot) {
    const { error: updateError } = await supabase
      .from("auction_lots")
      .update({ reprint: true, reprint_registered: true, reprint_source_lot_id: sourceLotId })
      .eq("id", currentLot.id as string)
      .eq("factory_id", profile.factory_id);
    if (updateError) return { ok: false, error: friendlyError(updateError) };
  }

  await writeAudit(supabase, profile.factory_id, {
    saleId,
    lotId: (currentLot?.id as string) ?? sourceLotId,
    action: "Re-print registered",
    detail: `Invoice ${formatFourDigitNo(invoiceNo)} was registered as a re-print${firstSaleNo ? `, first offered in sale ${firstSaleNo}` : " with no earlier sale recorded"}.`,
    reason: str(formData.get("reason")) || "Catalogued by the broker but not present in this system.",
    actor: profile.name,
  });

  revalidatePath(`${AUC}/${saleId}`);
  revalidatePath(`${AUC}/reprints`);
  return {
    ok: true,
    notice: firstSaleNo
      ? `Registered as a re-print first offered in sale ${firstSaleNo}.`
      : "Registered as a re-print.",
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
  if (!["acknowledged", "valued"].includes(lot.state as string)) {
    return { ok: false, error: "Only an acknowledged or valued lot can be registered as a historic re-print." };
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
    .update({ reprint: true, sample_allowance: cumulativeSample, net_wt: nextNet })
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
      .update({ reprint: false, sample_allowance: lot.sample_allowance, net_wt: lot.net_wt })
      .eq("id", lot.id)
      .eq("sale_id", lot.sale_id)
      .eq("factory_id", profile.factory_id)
      .eq("reprint", true);
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

/**
 * Registers a re-print the factory already had outstanding when it started
 * using this system — a lot from a sale that predates every record here.
 *
 * It creates a REAL lot under a REAL Broker Invoice, entered exactly the way
 * an ordinary lot invoice is (same prefix resolution, same grade and kg/bag
 * rules, same numbering), and only then moves it to `re-print`. That is the
 * whole point: once the lot exists in `re-print`, the acknowledgement
 * carry-forward resolver already links a later broker catalogue row to it as a
 * re-print child through `reprint_source_lot_id`, so nothing in the ACK,
 * valuation, contract, or settlement path needs to know this register exists.
 * A parallel "outstanding re-prints" table would have needed exactly that.
 *
 * Its Broker Invoice is stamped `entry_source = 'reprint-register'` so the
 * operator can see it was entered here rather than dispatched.
 */
export async function registerOutstandingReprint(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  if (profile.role !== "owner") return { ok: false, error: "Only the owner can register an outstanding re-print." };

  const resolved = await resolveBrokerInvoiceForLot(formData, { entrySource: "reprint-register" });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if ("pending" in resolved) {
    return { ok: true, notice: "Sent for supervisor approval — this prefix isn't the active one." };
  }

  const created = await createDispatchedLotForList(resolved.saleId, formData);
  if (!created.ok) {
    // Same cleanup contract as the Invoice Overview create: a lot can only be
    // validated once its parent exists, so a rejected entry would otherwise
    // strand the broker invoice this call just opened.
    if (resolved.created) {
      const discarded = await discardEmptyBrokerInvoice(resolved.saleId);
      if (!discarded) {
        return {
          ok: false,
          error: `${created.error} An empty broker invoice was left open — remove it from the broker invoice list.`,
        };
      }
    }
    return { ok: false, error: created.error };
  }
  if ("pending" in created) return { ok: true, notice: created.notice };

  const lotId = created.row.id;
  const invoiceNo = created.row.invoice_no ?? formatFourDigitNo(str(formData.get("invoice_no")));
  const reason = str(formData.get("reason")) || "Outstanding re-print entered at cutover.";
  // The broker invoice's target sale is the sale this re-print came out of —
  // that is what the operator enters on the form for a cutover entry.
  const originalSaleNo = formatSaleNo(str(formData.get("target_sale_no")));

  // The lot is born `invoiced` (or `shutout` when it is under the broker's
  // grade minimum). Neither is true of a re-print that is already sitting at
  // the broker, so it is moved on immediately, and any shutout reason the
  // threshold check attached goes with it. No extra sample is deducted here:
  // the sample weight entered on the form is what has ALREADY been taken, and
  // createDispatchedLotForList has applied it to net weight.
  // A re-print carries TWO sale numbers: the sale it was first printed for
  // (provisional, already stamped from the broker invoice) and the sale it
  // actually sold in. The second is optional at cutover — an outstanding
  // re-print may not have sold yet — and is recorded on the lot itself so the
  // chain can state it before any child lot exists.
  const soldSaleNo = formatSaleNo(str(formData.get("sold_sale_no")));
  // A sale still ahead of this one cannot be where the lot already sold, and
  // writing it here would place the lot in that sale before its broker has
  // acknowledged anything. Only a later acknowledgement may carry it forward.
  if (soldSaleNo && originalSaleNo && Number(saleNoKey(soldSaleNo)) > Number(saleNoKey(originalSaleNo))) {
    await deleteTenantRow(supabase, "auction_lots", lotId);
    if (resolved.created) await discardEmptyBrokerInvoice(resolved.saleId);
    return {
      ok: false,
      error: `Sale ${soldSaleNo} has not happened yet. Leave the sold sale blank — the sale ${soldSaleNo} acknowledgement will carry this re-print forward.`,
    };
  }
  const { data: updatedLot, error: updateError } = await supabase
    .from("auction_lots")
    .update({ reprint: true, unsold: false, shutout: false, shutout_reason: null, final_sale_no: soldSaleNo || null })
    .eq("id", lotId)
    .eq("factory_id", profile.factory_id)
    .select("id, state")
    .maybeSingle();
  if (updateError || !updatedLot) {
    const rollback = await deleteTenantRow(supabase, "auction_lots", lotId);
    if (rollback.error) {
      return { ok: false, error: "The lot was created but could not be marked as a re-print, and could not be removed. Review the broker invoice before retrying." };
    }
    if (resolved.created) await discardEmptyBrokerInvoice(resolved.saleId);
    return { ok: false, error: updateError ? friendlyError(updateError) : "The lot could not be marked as a re-print." };
  }

  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId: resolved.saleId,
    lotId,
    action: "Outstanding re-print registered",
    detail: `Invoice ${invoiceNo} was registered as a re-print outstanding from before this system${originalSaleNo ? `, first offered in sale ${originalSaleNo}` : ""}${soldSaleNo ? ` and sold in sale ${soldSaleNo}` : ""}. A later acknowledgement listing this invoice will link to it as a re-print child.`,
    reason,
    actor: profile.name,
  });
  if (auditError) {
    const rollback = await deleteTenantRow(supabase, "auction_lots", lotId);
    if (rollback.error) {
      return { ok: false, error: "The re-print was registered but its audit entry could not be saved, and the lot could not be removed. Review the broker invoice before retrying." };
    }
    if (resolved.created) await discardEmptyBrokerInvoice(resolved.saleId);
    return { ok: false, error: friendlyError(auditError) };
  }

  // Re-run now that the lot is `re-print`: createDispatchedLotForList synced
  // the Broker Invoice while the lot was still `invoiced`, so without this the
  // invoice would keep a status its own lot contradicts — and, being left
  // open, would quietly absorb the next unrelated register entry.
  const synced = await syncDispatchStatusFromLots(supabase, resolved.saleId, profile.factory_id);
  if (!synced.ok) return synced;

  revalidatePath(`${AUC}/reprints`);
  return {
    ok: true,
    notice: `Invoice ${invoiceNo} registered as an outstanding re-print.`,
    invalidate: [
      { kind: "all", key: "auction.reprint-overview" },
      { kind: "all", key: "auction.invoice-overview" },
      { kind: "all", key: "auction.dispatches" },
      { kind: "exact", resource: { key: "auction.dispatch-lots", params: { saleId: resolved.saleId } } },
    ],
  };
}

/**
 * The Re-prints list's single `+ New` action. Both ways of getting a lot into
 * the re-print chain are entered from the same create panel, so the list keeps
 * exactly one creation control:
 *
 * - `outstanding` — the lot does not exist here at all (a re-print left over
 *   from before go-live). Enters it, then moves it to `re-print`.
 * - `historic` — the lot is already in the system and should become the ROOT
 *   of a re-print chain.
 */
export async function registerReprintEntry(formData: FormData): Promise<ListMutationResult> {
  return str(formData.get("mode")) === "historic"
    ? registerHistoricReprint(formData)
    : registerOutstandingReprint(formData);
}

export type CreateDispatchedLotResult =
  | { ok: true; row: LotRow; notice: string }
  | { ok: true; pending: true; notice: string }
  | { ok: false; error: string };

/** List-local create command. It returns the canonical saved row so the lot
 * list can update itself without an optimistic placeholder or route refresh. */
export async function createDispatchedLotForList(
  saleId: string,
  formData: FormData,
  options: { bypassPrefixId?: string } = {},
): Promise<CreateDispatchedLotResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const rawInvoiceList = invoiceNumbers(formData);
  const rawInvoiceNo = rawInvoiceList[0] ?? "";
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const sampleKg = sampleAllowance(formData);
  if (!rawInvoiceNo) return { ok: false, error: "Invoice number is required." };
  if (!grade) return { ok: false, error: "Grade is required." };
  if (!(bags > 0) || !(kgPerBag > 0)) return { ok: false, error: "Bags and kg/bag must be positive." };
  if (sampleKg >= bags * kgPerBag) return { ok: false, error: "Sample weight must be less than the gross lot weight." };
  const gradeRule = (await gradeRulesByCode(supabase, profile.factory_id, [grade])).get(grade);
  // The foreign key would reject this too, but only the caller knows which
  // value was typed — see gradeRulesByCode.
  if (!gradeRule) return { ok: false, error: notAnExisting(grade, "tea grade") };
  const minKgPerBag = gradeRule.minKgPerBag;
  if (minKgPerBag != null && minKgPerBag > 0 && kgPerBag < minKgPerBag) {
    return { ok: false, error: `kg/bag for grade ${grade} must be at least ${minKgPerBag.toFixed(2)} kg (factory minimum).` };
  }

  let prefixString: string;
  let needsPrefixApproval = false;
  let approvalPrefixId: string | null = null;
  if (options.bypassPrefixId) {
    const { data: prefixRow, error: prefixError } = await supabase
      .from("invoice_number_prefixes")
      .select("prefix")
      .eq("id", options.bypassPrefixId)
      .eq("factory_id", profile.factory_id)
      .maybeSingle();
    if (prefixError) return { ok: false, error: friendlyError(prefixError) };
    if (!prefixRow) return { ok: false, error: "Unknown invoice number prefix." };
    prefixString = prefixRow.prefix as string;
  } else {
    const requestedPrefixId = str(formData.get("prefix_id")) || undefined;
    // As in updateLot: a prefix typed into the number is a real request.
    const requestedPrefix = parseCompositeInvoiceNo(rawInvoiceNo)?.prefix;
    const prefixResult = await resolveInvoicePrefix({
      supabase, factoryId: profile.factory_id, category: "regular_invoice", role: profile.role, requestedPrefixId, requestedPrefix,
    });
    if (!prefixResult.ok) return { ok: false, error: prefixResult.error };
    // The lot is created either way and is visible straight away; an
    // abnormal prefix only adds an approval request against it, raised below
    // once the lot exists so the reviewer can act on a real record. Declining
    // removes it again (see declineInvoicePrefixException).
    needsPrefixApproval = prefixResult.needsApproval;
    approvalPrefixId = prefixResult.prefix.id;
    prefixString = prefixResult.prefix.prefix;
  }
  const invoiceList = rawInvoiceList.map((n) => buildCompositeInvoiceNo(prefixString, invoiceSeqOf(n)));
  const invoiceNo = invoiceList[0] ?? "";
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
    state: "invoiced",
    shutout: isBelowAppliedThreshold,
    reprint: Boolean(reprintSource.sourceLotId),
    shutout_reason: isBelowAppliedThreshold ? `Below broker minimum ${threshold.toFixed(2)} kg for ${grade}` : null,
    lot_source: "factory",
    reprint_source_lot_id: reprintSource.sourceLotId,
  }).select("id, invoice_no, provisional_sale_no, final_sale_no, lot_no, grade, bags, kg_per_bag, sample_allowance, net_wt, state, shutout, shutout_reason, lot_source").single();
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
  // Raised only now: the reviewer decides about a record that already exists
  // and is on screen, and `created_record_id` is what lets a decline delete
  // exactly this lot rather than replaying a creation.
  let notice = "Lot added.";
  if (needsPrefixApproval && approvalPrefixId) {
    const { error: exceptionError } = await supabase.from("invoice_prefix_exceptions").insert({
      factory_id: profile.factory_id,
      category: "regular_invoice",
      requested_prefix_id: approvalPrefixId,
      context_id: saleId,
      payload: { invoice_no: invoiceList },
      requested_by: profile.id,
      created_record_id: createdLot.id as string,
    });
    if (exceptionError) return { ok: false, error: friendlyError(exceptionError) };
    notice = "Lot added, and sent for approval — this prefix isn't the active one.";
  }

  const synced = await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  if (!synced.ok) return synced;
  return {
    ok: true,
    notice,
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
      shutout: Boolean(createdLot.shutout),
      shutout_reason: createdLot.shutout_reason as string | null,
      unsold: false,
      reprint: Boolean(reprintSource.sourceLotId),
      withdrawn: false,
      not_valued: false,
      missing: false,
      settled: false,
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

/**
 * Removes a broker invoice that was opened for a lot entry which then failed,
 * so a rejected entry leaves nothing behind. Returns false if it could not be
 * removed, so the caller can say so rather than silently orphaning it.
 *
 * Re-checks emptiness against the database instead of trusting the caller:
 * auction_sales cascades to auction_lots, so deleting one that concurrently
 * gained a lot would destroy real work. An invoice that is no longer empty is
 * left alone and reported as success — it is no longer an orphan.
 */
async function discardEmptyBrokerInvoice(saleId: string): Promise<boolean> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { count, error: countError } = await supabase
    .from("auction_lots")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", saleId)
    .eq("factory_id", profile.factory_id);
  if (countError) return false;
  if ((count ?? 0) > 0) return true;
  const { error } = await deleteTenantRow(supabase, "auction_sales", saleId);
  return !error;
}

/**
 * Invoice Overview create: adds a lot invoice straight from the overview,
 * attaching it to the broker invoice for its broker + selling mark + dispatch
 * date and opening that broker invoice first if none is open yet. Both steps
 * are the existing ones — this only sequences them, so the overview cannot
 * drift from what the broker invoice pages do.
 *
 * It returns no row: the overview's row shape is a join of lot and broker
 * invoice fields, so the list refetches through `invalidate` rather than
 * splicing in a locally-built row that could disagree with the server.
 */
export async function createInvoiceFromOverview(formData: FormData): Promise<ListMutationResult> {
  const resolved = await resolveBrokerInvoiceForLot(formData);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if ("pending" in resolved) {
    return { ok: true, notice: "Sent for supervisor approval — this prefix isn't the active one." };
  }

  const created = await createDispatchedLotForList(resolved.saleId, formData);
  if (!created.ok) {
    // A lot cannot be validated before its parent exists — it is created with
    // the parent's id — so the broker invoice is already open by the time the
    // lot is rejected (below-minimum kg/bag, unknown grade, duplicate invoice
    // number...). Undo it, or every failed attempt leaves an empty draft
    // behind. Only when THIS call opened it, and only while it is still empty.
    if (resolved.created) {
      const discarded = await discardEmptyBrokerInvoice(resolved.saleId);
      if (!discarded) {
        return {
          ok: false,
          error: `${created.error} An empty broker invoice was left open — remove it from the broker invoice list.`,
        };
      }
    }
    return { ok: false, error: created.error };
  }
  const notice = "pending" in created
    ? created.notice
    : resolved.created
      ? "Invoice created, and a new broker invoice was opened for it."
      : created.notice;
  return { ok: true, notice, invalidate: OVERVIEW_INVALIDATION(resolved.saleId) };
}

const OVERVIEW_INVALIDATION = (saleId: string): NonNullable<Extract<ListMutationResult, { ok: true }>["invalidate"]> => [
  { kind: "all", key: "auction.invoice-overview" },
  { kind: "all", key: "auction.dispatches" },
  { kind: "exact", resource: { key: "auction.dispatch-lots", params: { saleId } } },
];

/** Replays a lot creation from an approved invoice_prefix_exceptions row. */
export async function createLotFromApprovedException(
  saleId: string,
  payload: Record<string, unknown>,
  requestedPrefixId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const formData = new FormData();
  const invoiceNos = Array.isArray(payload.invoice_no) ? (payload.invoice_no as unknown[]).map(String) : [String(payload.invoice_no ?? "")];
  for (const value of invoiceNos) formData.append("invoice_no", value);
  if (payload.lot_no != null) formData.set("lot_no", String(payload.lot_no));
  if (payload.grade != null) formData.set("grade", String(payload.grade));
  if (payload.bags != null) formData.set("bags", String(payload.bags));
  if (payload.kg_per_bag != null) formData.set("kg_per_bag", String(payload.kg_per_bag));
  if (payload.sample_allowance != null) formData.set("sample_allowance", String(payload.sample_allowance));
  const result = await createDispatchedLotForList(saleId, formData, { bypassPrefixId: requestedPrefixId });
  if (!result.ok) return result;
  if ("pending" in result) return { ok: false, error: "Unexpected pending state while replaying an approved lot." };
  return { ok: true, id: result.row.id };
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
  if (!isOwner && lot.state !== "invoiced") {
    return { ok: false, error: "Only invoiced lots can be removed." };
  }
  const { error: deleteError } = await deleteTenantRow(supabase, "auction_lots", id);
  if (deleteError) return { ok: false, error: deleteError };
  const synced = await syncDispatchStatusFromLots(supabase, saleId, profile.factory_id);
  if (!synced.ok) return synced;
  return { ok: true, notice: "Lot deleted.", invalidate: OVERVIEW_INVALIDATION(saleId) };
}
