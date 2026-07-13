"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModuleAccess, requireProfile } from "@/lib/profile";
import { AUC, str, num, back, nextDispatchNo, saleDetailPath, stageImport, writeAudit } from "./_shared";
import { formatFourDigitNo, formatSaleNo } from "../sale-number";

// ---------- Broker invoices ----------
export async function createSale(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const np = `${AUC}/new`;
  const brokerId = str(formData.get("broker_id"));
  const saleNo = await nextDispatchNo(supabase);
  const targetSaleNo = formatSaleNo(str(formData.get("target_sale_no")));
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
  const { supabase, profile } = await requireProfile(["owner"]);
  // Guard: the sale must belong to this factory (RLS enforces it too — this
  // makes the cross-tenant case a clean no-op instead of a partial cascade).
  const { data: sale } = await supabase
    .from("auction_sales").select("id").eq("id", id).eq("factory_id", profile.factory_id).maybeSingle();
  if (!sale) return;
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
  const { supabase, profile } = await requireProfile(["owner"]);
  const updates: Record<string, string | null> = {};
  const target = formatSaleNo(str(formData.get("target_sale_no")));
  const saleDate = str(formData.get("sale_date"));
  const dispatchDate = str(formData.get("dispatch_date"));
  const promptDate = str(formData.get("prompt_date"));
  if (formData.has("target_sale_no")) updates.target_sale_no = target || null;
  if (formData.has("sale_date")) updates.sale_date = saleDate || null;
  if (dispatchDate) updates.dispatch_date = dispatchDate;
  if (formData.has("prompt_date")) updates.prompt_date = promptDate || null;
  if (Object.keys(updates).length > 0) {
    await supabase.from("auction_sales").update(updates).eq("id", id).eq("factory_id", profile.factory_id);
    if (updates.target_sale_no) {
      await supabase
        .from("auction_lots")
        .update({ provisional_sale_no: updates.target_sale_no })
        .eq("sale_id", id)
        .eq("factory_id", profile.factory_id)
        .is("final_sale_no", null);
    }
  }
  revalidatePath(AUC);
  revalidatePath(`${AUC}/${id}`);
}

export async function confirmDispatchDraft(id: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
  await supabase
    .from("auction_sales")
    .update({ status: "invoiced" })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .in("status", ["draft", "dispatched"]);
  revalidatePath(AUC);
  revalidatePath(`${AUC}/${id}`);
}

export async function completeGrn(id: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${id}`;
  const { data: invoice } = await supabase
    .from("auction_sales")
    .select("id, status")
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (!invoice) back(detail, "Broker Invoice not found.");
  if (!["invoiced", "grn"].includes(invoice?.status as string)) {
    back(detail, "Confirm the Broker Invoice before proceeding to GRN.");
  }

  const entry = formData.get("grn_file");
  let uploaded = false;
  if (entry instanceof File && entry.size > 0) {
    const allowed = entry.type === "application/pdf" || entry.type.startsWith("image/");
    if (!allowed) back(detail, "GRN must be an image or PDF.");
    const safeName = entry.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const storagePath = `${profile.factory_id}/${id}/grn/${randomUUID()}-${safeName}`;
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("auction-documents")
      .upload(storagePath, bytes, { contentType: entry.type || "application/octet-stream", upsert: false });
    if (uploadError) back(detail, `Could not upload GRN: ${uploadError.message}`);
    const importId = await stageImport(
      supabase,
      profile.factory_id,
      id,
      "grn",
      entry,
      { parserStatus: "pending", mimeType: entry.type, size: entry.size },
      storagePath,
    );
    if (!importId) {
      await supabase.storage.from("auction-documents").remove([storagePath]);
      back(detail, "Could not record the uploaded GRN.");
    }
    await supabase
      .from("doc_imports")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", importId);
    uploaded = true;
  }

  await supabase
    .from("auction_sales")
    .update({ status: "grn" })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .in("status", ["invoiced", "grn"]);
  revalidatePath(AUC);
  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(uploaded ? "GRN uploaded; Broker Invoice moved to GRN." : "Broker Invoice moved to GRN without a document.")}`);
}

export async function updateSaleLotsBulk(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const lotIds = formData
    .getAll("lot_id")
    .map((value) => str(value))
    .filter(Boolean);
  if (lotIds.length === 0) back(detail, "Select at least one lot to edit.");

  const requestedState = str(formData.get("state"));
  const validStates = new Set(["acknowledged", "pending", "missing", "shutout", "not-valued", "valued", "withdrawn", "re-print", "sold", "settled"]);
  const state = validStates.has(requestedState) ? requestedState : "";
  const invoiceText = str(formData.get("invoice_no"));
  const invoiceList = invoiceText
    ? [...new Set(invoiceText.split(/[,\s]+/).map((value) => formatFourDigitNo(value)).filter(Boolean))]
    : [];
  const lotNoText = str(formData.get("lot_no"));
  const lotNo = lotNoText ? formatFourDigitNo(lotNoText) : "";
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  const sampleKg = Math.max(0, num(formData.get("sample_allowance")) || 0);
  const buyerName = str(formData.get("buyer_name"));
  const buyerVatNo = str(formData.get("buyer_vat_no"));
  const pricePerKg = num(formData.get("price_per_kg"));
  const proceeds = num(formData.get("proceeds"));
  const vatAmount = num(formData.get("vat_amount"));
  const onGuaranteeRaw = str(formData.get("on_guarantee"));
  const hasInvoice = invoiceList.length > 0;
  const hasLotNo = lotNoText !== "";
  const hasGrade = grade !== "";
  const hasBags = formData.has("bags") && String(formData.get("bags") ?? "").trim() !== "";
  const hasKgPerBag = formData.has("kg_per_bag") && String(formData.get("kg_per_bag") ?? "").trim() !== "";
  const hasSampleKg = formData.has("sample_allowance") && String(formData.get("sample_allowance") ?? "").trim() !== "";
  const hasPrice = formData.has("price_per_kg") && String(formData.get("price_per_kg") ?? "").trim() !== "";
  const hasProceeds = formData.has("proceeds") && String(formData.get("proceeds") ?? "").trim() !== "";
  const hasVat = formData.has("vat_amount") && String(formData.get("vat_amount") ?? "").trim() !== "";
  const hasSaleValues = hasPrice || hasProceeds || hasVat || buyerName || onGuaranteeRaw;
  const hasCompleteSaleValues = hasPrice && hasProceeds && hasVat;
  const nextState = state || (hasCompleteSaleValues ? "sold" : "");

  const { data: lots } = await supabase
    .from("auction_lots")
    .select("id, sale_id, invoice_no, lot_no, grade, bags, kg_per_bag, net_wt, sample_allowance, auction_sales(status)")
    .eq("factory_id", profile.factory_id)
    .in("id", lotIds);
  const lotRows = (lots ?? []) as {
    id: string;
    sale_id: string;
    invoice_no: string | null;
    lot_no: string | null;
    grade: string | null;
    bags: number | null;
    kg_per_bag: string | number | null;
    net_wt: string | number | null;
    sample_allowance: string | number | null;
    auction_sales?: { status?: string | null } | { status?: string | null }[] | null;
  }[];
  if (lotRows.length !== lotIds.length) back(detail, "One or more selected lots could not be found.");
  const settledLot = lotRows.find((lot) => {
    const sale = lot.auction_sales;
    const status = Array.isArray(sale) ? sale[0]?.status : sale?.status;
    return status === "settled";
  });
  if (settledLot) back(detail, "Invoice editing is locked after settlement.");
  if ((hasInvoice || hasLotNo) && lotRows.length !== 1) {
    back(detail, "Invoice and lot number edits can only be applied to one selected lot at a time.");
  }
  if (hasInvoice) {
    const { data: invoiceRows } = await supabase
      .from("lot_invoices")
      .select("invoice_no, lot_id")
      .eq("factory_id", profile.factory_id)
      .in("invoice_no", invoiceList);
    const conflict = (invoiceRows ?? []).find((row) => row.lot_id !== lotRows[0].id);
    if (conflict) back(detail, `Invoice ${conflict.invoice_no as string} is already attached to another lot.`);
  }

  const { data: existingLines } = await supabase
    .from("sale_lines")
    .select("lot_id, buyer_id, price_per_kg, proceeds, vat_amount, on_guarantee")
    .in("lot_id", lotIds);
  const lineByLot = new Map((existingLines ?? []).map((line) => [line.lot_id as string, line]));

  if (nextState === "sold") {
    const invalidLot = lotRows.find((lot) => {
      const existing = lineByLot.get(lot.id);
      const nextPrice = hasPrice ? pricePerKg : Number(existing?.price_per_kg ?? Number.NaN);
      const nextProceeds = hasProceeds ? proceeds : Number(existing?.proceeds ?? Number.NaN);
      const nextVat = hasVat ? vatAmount : Number(existing?.vat_amount ?? Number.NaN);
      return !(nextPrice > 0) || !(nextProceeds > 0) || Number.isNaN(nextVat);
    });
    if (invalidLot) {
      back(detail, "It is not allowed to change the status to sold without entering Price/kg, proceeds value and VAT.");
    }
  }

  let buyerId: string | null = null;
  if (buyerName) {
    const { data: buyer, error: buyerError } = await supabase
      .from("buyers")
      .upsert({ factory_id: profile.factory_id, name: buyerName, vat_no: buyerVatNo || null }, { onConflict: "factory_id,name" })
      .select("id")
      .single();
    if (buyerError || !buyer?.id) back(detail, buyerError?.message ?? "Could not save buyer.");
    buyerId = (buyer as { id: string }).id;
  }

  if (nextState) {
    await supabase
      .from("auction_lots")
      .update({ state: nextState, shutout_reason: nextState === "shutout" ? "Manual override" : null })
      .eq("factory_id", profile.factory_id)
      .in("id", lotIds);
  }

  for (const lot of lotRows) {
    const nextBags = hasBags ? bags : Number(lot.bags ?? 0);
    const nextKgPerBag = hasKgPerBag ? kgPerBag : Number(lot.kg_per_bag ?? 0);
    const nextSampleKg = hasSampleKg ? sampleKg : Number(lot.sample_allowance ?? 0);
    const lotUpdates: Record<string, string | number | null> = {};
    if (hasInvoice) lotUpdates.invoice_no = invoiceList[0];
    if (hasLotNo) lotUpdates.lot_no = lotNo || null;
    if (hasGrade) lotUpdates.grade = grade;
    if (hasBags) lotUpdates.bags = bags;
    if (hasKgPerBag) lotUpdates.kg_per_bag = kgPerBag;
    if (hasSampleKg) lotUpdates.sample_allowance = sampleKg;
    if (hasBags || hasKgPerBag || hasSampleKg) {
      if (!(nextBags > 0) || !(nextKgPerBag > 0)) back(detail, "Bags and kg/bag must be positive.");
      if (nextSampleKg >= nextBags * nextKgPerBag) back(detail, "Sample weight must be less than the gross lot weight.");
      lotUpdates.net_wt = Number(Math.max(0, nextBags * nextKgPerBag - nextSampleKg).toFixed(2));
    }
    if (Object.keys(lotUpdates).length > 0) {
      await supabase.from("auction_lots").update(lotUpdates).eq("id", lot.id).eq("factory_id", profile.factory_id);
    }
  }

  if (hasInvoice) {
    const lot = lotRows[0];
    await supabase.from("lot_invoices").delete().eq("lot_id", lot.id);
    await supabase.from("lot_invoices").insert(invoiceList.map((invoice) => ({
      factory_id: profile.factory_id,
      lot_id: lot.id,
      invoice_no: invoice,
    })));
  }

  if (hasSaleValues || nextState === "sold") {
    const saleLineRows = lotRows.flatMap((lot) => {
      const existing = lineByLot.get(lot.id);
      const shouldWriteLine = Boolean(existing) || nextState === "sold" || hasCompleteSaleValues;
      if (!shouldWriteLine) return [];
      const nextNetWt = hasBags || hasKgPerBag || hasSampleKg
        ? Math.max(0, (hasBags ? bags : Number(lot.bags ?? 0)) * (hasKgPerBag ? kgPerBag : Number(lot.kg_per_bag ?? 0)) - (hasSampleKg ? sampleKg : Number(lot.sample_allowance ?? 0)))
        : Number(lot.net_wt ?? 0);
      const nextSampleAllowance = hasSampleKg ? sampleKg : Number(lot.sample_allowance ?? 0);
      return [{
        factory_id: profile.factory_id,
        sale_id: lot.sale_id,
        lot_id: lot.id,
        buyer_id: buyerId ?? (existing?.buyer_id as string | null | undefined) ?? null,
        net_wt: Number(nextNetWt).toFixed(2),
        sample_allowance: Number(nextSampleAllowance).toFixed(2),
        price_per_kg: (hasPrice ? pricePerKg : Number(existing?.price_per_kg ?? 0)).toFixed(2),
        proceeds: (hasProceeds ? proceeds : Number(existing?.proceeds ?? 0)).toFixed(2),
        vat_amount: (hasVat ? vatAmount : Number(existing?.vat_amount ?? 0)).toFixed(2),
        on_guarantee: onGuaranteeRaw ? onGuaranteeRaw === "true" : Boolean(existing?.on_guarantee ?? false),
      }];
    });
    if (saleLineRows.length > 0) await supabase.from("sale_lines").upsert(saleLineRows, { onConflict: "lot_id" });
  }

  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(`Updated ${lotIds.length} lot(s).`)}`);
}

export async function updateSaleLotsInline(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(["owner"]);
  const detail = await saleDetailPath(supabase, profile.factory_id, saleId);
  const validStates = new Set(["acknowledged", "pending", "missing", "shutout", "not-valued", "valued", "withdrawn", "re-print", "sold", "settled"]);
  const lotIds = formData.getAll("lot_id").map((value) => str(value)).filter(Boolean);
  if (lotIds.length === 0) back(detail, "Select at least one lot to edit.");

  const values = {
    invoiceNo: formData.getAll("invoice_no").map((value) => str(value)),
    lotNo: formData.getAll("lot_no").map((value) => str(value)),
    grade: formData.getAll("grade").map((value) => str(value)),
    bags: formData.getAll("bags").map((value) => str(value)),
    kgPerBag: formData.getAll("kg_per_bag").map((value) => str(value)),
    sampleKg: formData.getAll("sample_allowance").map((value) => str(value)),
    state: formData.getAll("state").map((value) => str(value)),
    buyerName: formData.getAll("buyer_name").map((value) => str(value)),
    buyerVatNo: formData.getAll("buyer_vat_no").map((value) => str(value)),
    pricePerKg: formData.getAll("price_per_kg").map((value) => str(value)),
    proceeds: formData.getAll("proceeds").map((value) => str(value)),
    vatAmount: formData.getAll("vat_amount").map((value) => str(value)),
    onGuarantee: formData.getAll("on_guarantee").map((value) => str(value)),
  };

  const submittedRows = lotIds.map((id, index) => {
    const invoiceList = [...new Set(
      (values.invoiceNo[index] ?? "")
        .split(/[,\s]+/)
        .map((value) => formatFourDigitNo(value))
        .filter(Boolean),
    )];
    const state = values.state[index] ?? "";
    return {
      id,
      invoiceList,
      lotNo: formatFourDigitNo(values.lotNo[index] ?? "") || null,
      grade: values.grade[index] ?? "",
      bags: Number(values.bags[index] ?? 0),
      kgPerBag: Number(values.kgPerBag[index] ?? 0),
      sampleKg: Math.max(0, Number(values.sampleKg[index] ?? 0) || 0),
      state: validStates.has(state) ? state : "",
      buyerName: values.buyerName[index] ?? "",
      buyerVatNo: values.buyerVatNo[index] ?? "",
      pricePerKg: values.pricePerKg[index] === "" ? null : Number(values.pricePerKg[index]),
      proceeds: values.proceeds[index] === "" ? null : Number(values.proceeds[index]),
      vatAmount: values.vatAmount[index] === "" ? null : Number(values.vatAmount[index]),
      onGuarantee: values.onGuarantee[index] === "" ? null : values.onGuarantee[index] === "true",
    };
  });

  const allSubmittedInvoices = submittedRows.flatMap((row) => row.invoiceList);
  const duplicateInvoice = allSubmittedInvoices.find((invoice, index) => allSubmittedInvoices.indexOf(invoice) !== index);
  if (duplicateInvoice) back(detail, `Invoice ${duplicateInvoice} is duplicated in the selected rows.`);

  const { data: lots } = await supabase
    .from("auction_lots")
    .select("id, sale_id, auction_sales(status)")
    .eq("factory_id", profile.factory_id)
    .in("id", lotIds);
  const foundLotIds = new Set((lots ?? []).map((lot) => lot.id as string));
  if (foundLotIds.size !== lotIds.length) back(detail, "One or more selected lots could not be found.");
  const settledLot = (lots ?? []).find((lot) => {
    const sale = (lot as unknown as { auction_sales?: { status?: string | null } | { status?: string | null }[] | null }).auction_sales;
    const status = Array.isArray(sale) ? sale[0]?.status : sale?.status;
    return status === "settled";
  });
  if (settledLot) back(detail, "Invoice editing is locked after settlement.");
  const saleIdByLotId = new Map((lots ?? []).map((lot) => [lot.id as string, lot.sale_id as string]));

  if (allSubmittedInvoices.length > 0) {
    const { data: invoiceRows } = await supabase
      .from("lot_invoices")
      .select("invoice_no, lot_id")
      .eq("factory_id", profile.factory_id)
      .in("invoice_no", allSubmittedInvoices);
    const selectedLotSet = new Set(lotIds);
    const conflict = (invoiceRows ?? []).find((row) => !selectedLotSet.has(row.lot_id as string));
    if (conflict) back(detail, `Invoice ${conflict.invoice_no as string} is already attached to another lot.`);
  }

  const { data: existingLines } = await supabase
    .from("sale_lines")
    .select("lot_id, buyer_id")
    .in("lot_id", lotIds);
  const existingLineByLot = new Map((existingLines ?? []).map((line) => [line.lot_id as string, line]));

  const buyerNames = [...new Set(submittedRows.map((row) => row.buyerName).filter(Boolean))];
  const buyerByName = new Map<string, string>();
  for (const buyerName of buyerNames) {
    const row = submittedRows.find((item) => item.buyerName === buyerName);
    const { data: buyer, error: buyerError } = await supabase
      .from("buyers")
      .upsert({ factory_id: profile.factory_id, name: buyerName, vat_no: row?.buyerVatNo || null }, { onConflict: "factory_id,name" })
      .select("id, name")
      .single();
    if (buyerError || !buyer?.id) back(detail, buyerError?.message ?? `Could not save buyer ${buyerName}.`);
    buyerByName.set(buyerName, (buyer as { id: string }).id);
  }

  for (const row of submittedRows) {
    if (row.invoiceList.length === 0) back(detail, "Invoice number is required for every edited lot.");
    if (!row.grade) back(detail, "Grade is required for every edited lot.");
    if (!(row.bags > 0) || !(row.kgPerBag > 0)) back(detail, "Bags and kg/bag must be positive.");
    if (row.sampleKg >= row.bags * row.kgPerBag) back(detail, "Sample weight must be less than the gross lot weight.");
    if (row.state === "sold" && (!(Number(row.pricePerKg) > 0) || !(Number(row.proceeds) > 0) || row.vatAmount == null || Number.isNaN(Number(row.vatAmount)))) {
      back(detail, "It is not allowed to change the status to sold without entering Price/kg, proceeds value and VAT.");
    }
  }

  for (const row of submittedRows) {
    const netWt = Number(Math.max(0, row.bags * row.kgPerBag - row.sampleKg).toFixed(2));
    await supabase
      .from("auction_lots")
      .update({
        invoice_no: row.invoiceList[0],
        lot_no: row.lotNo,
        grade: row.grade,
        bags: row.bags,
        kg_per_bag: row.kgPerBag,
        sample_allowance: row.sampleKg,
        net_wt: netWt,
        state: row.state,
        shutout_reason: row.state === "shutout" ? "Manual override" : null,
      })
      .eq("id", row.id)
      .eq("factory_id", profile.factory_id);

    await supabase.from("lot_invoices").delete().eq("lot_id", row.id);
    await supabase.from("lot_invoices").insert(row.invoiceList.map((invoice) => ({
      factory_id: profile.factory_id,
      lot_id: row.id,
      invoice_no: invoice,
    })));

    if (row.state === "re-print") {
      const { data: staleLines } = await supabase.from("sale_lines").select("id").eq("lot_id", row.id);
      const staleLineIds = (staleLines ?? []).map((line) => line.id as string);
      if (staleLineIds.length > 0) {
        await supabase.from("vat_ledger").delete().in("sale_line_id", staleLineIds);
        await supabase.from("sale_lines").delete().in("id", staleLineIds);
      }
      await writeAudit(supabase, profile.factory_id, {
        saleId: saleIdByLotId.get(row.id) ?? saleId,
        lotId: row.id,
        action: "Manual re-print",
        detail: `Invoice ${row.invoiceList.join(", ")} was manually moved to re-print with ${row.sampleKg.toFixed(2)} kg cumulative sample allowance and ${netWt.toFixed(2)} kg remaining net weight.`,
        reason: "Owner correction or manual workflow without document analysis.",
        actor: profile.name,
      });
      continue;
    }

    const hasSaleLineValues = row.pricePerKg != null || row.proceeds != null || row.vatAmount != null || row.buyerName || row.onGuarantee != null;
    const shouldWriteLine = row.state === "sold" || hasSaleLineValues || existingLineByLot.has(row.id);
    if (shouldWriteLine) {
      await supabase.from("sale_lines").upsert({
        factory_id: profile.factory_id,
        sale_id: saleIdByLotId.get(row.id) ?? saleId,
        lot_id: row.id,
        buyer_id: row.buyerName ? buyerByName.get(row.buyerName) ?? null : null,
        net_wt: netWt.toFixed(2),
        sample_allowance: row.sampleKg.toFixed(2),
        price_per_kg: Number(row.pricePerKg ?? 0).toFixed(2),
        proceeds: Number(row.proceeds ?? 0).toFixed(2),
        vat_amount: Number(row.vatAmount ?? 0).toFixed(2),
        on_guarantee: Boolean(row.onGuarantee),
      }, { onConflict: "lot_id" });
    }
  }

  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(`Updated ${submittedRows.length} lot(s).`)}`);
}
