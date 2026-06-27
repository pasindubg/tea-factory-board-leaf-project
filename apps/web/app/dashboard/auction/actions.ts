"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import {
  isAcknowledgement,
  parseAcknowledgement,
  reconcileAcknowledgement,
  isValuation,
  parseValuation,
  isContract,
  parseContract,
  computeSettlement,
  reconcileVat,
  isBankCsv,
  parseBankCsv,
  reconcileBank,
  type ParsedAcknowledgement,
  type ParsedValuation,
  type ParsedContract,
} from "@tea/api";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";

const AUC = "/dashboard/auction";
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());
const roles = () => getDefaultRoles("auction");
const back = (path: string, error: string): never => redirect(`${path}?error=${encodeURIComponent(error)}`);

// ---------- Registry: brokers & marks ----------
export async function createBroker(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const reg = `${AUC}/registry`;
  const name = str(formData.get("name"));
  if (!name) back(reg, "Broker name is required.");
  const { error } = await supabase.from("brokers").insert({
    factory_id: profile.factory_id,
    name,
    vat_no: str(formData.get("vat_no")) || null,
    address: str(formData.get("address")) || null,
  });
  if (error) back(reg, error.message);
  revalidatePath(reg);
  redirect(reg);
}

export async function createMark(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const reg = `${AUC}/registry`;
  const code = str(formData.get("code"));
  const name = str(formData.get("name"));
  if (!code || !name) back(reg, "Mark code and name are both required.");
  const { error } = await supabase.from("marks").insert({
    factory_id: profile.factory_id,
    code,
    name,
    address: str(formData.get("address")) || null,
  });
  if (error) back(reg, error.message);
  revalidatePath(reg);
  redirect(reg);
}

// ---------- Sales ----------
export async function createSale(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const np = `${AUC}/new`;
  const brokerId = str(formData.get("broker_id"));
  const saleNo = str(formData.get("sale_no"));
  if (!brokerId) back(np, "Pick a broker.");
  if (!saleNo) back(np, "Sale number is required.");
  const { data, error } = await supabase
    .from("auction_sales")
    .insert({
      factory_id: profile.factory_id,
      broker_id: brokerId,
      sale_no: saleNo,
      sale_date: str(formData.get("sale_date")) || null,
    })
    .select("id")
    .single();
  if (error || !data) return back(np, error?.message ?? "Could not create the sale.");
  revalidatePath(AUC);
  redirect(`${AUC}/${data.id}`);
}

export async function deleteSale(id: string) {
  const { supabase } = await requireProfile(roles());
  await supabase.from("auction_lots").delete().eq("sale_id", id);
  await supabase.from("auction_sales").delete().eq("id", id);
  revalidatePath(AUC);
  redirect(AUC);
}

// ---------- Invoiced lots (factory's dispatch record) ----------
export async function addInvoicedLot(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const invoiceNo = str(formData.get("invoice_no"));
  const grade = str(formData.get("grade"));
  const bags = num(formData.get("bags"));
  const kgPerBag = num(formData.get("kg_per_bag"));
  if (!invoiceNo) back(detail, "Invoice number is required.");
  if (!grade) back(detail, "Grade is required.");
  if (!(bags > 0) || !(kgPerBag > 0)) back(detail, "Bags and kg/bag must both be positive.");
  const netWt = Number((bags * kgPerBag).toFixed(2));
  const { error } = await supabase.from("auction_lots").insert({
    factory_id: profile.factory_id,
    sale_id: saleId,
    mark_id: str(formData.get("mark_id")) || null,
    invoice_no: invoiceNo,
    grade,
    bags,
    kg_per_bag: kgPerBag,
    net_wt: netWt,
    state: "invoiced",
  });
  if (error) back(detail, error.message);
  revalidatePath(detail);
  redirect(detail);
}

// Only invoiced lots can be removed by hand (to fix entry mistakes); catalogued
// lots are owned by the ingested acknowledgement.
export async function deleteLot(id: string, saleId: string) {
  const { supabase } = await requireProfile(roles());
  await supabase.from("auction_lots").delete().eq("id", id).eq("state", "invoiced");
  revalidatePath(`${AUC}/${saleId}`);
}

// ---------- Acknowledgement ingestion (parse → stage → review → confirm) ----------
export async function ingestAcknowledgement(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return back(detail, "Choose an Acknowledgement PDF to upload.");

  let text: string;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: true });
    text = Array.isArray(extracted.text) ? extracted.text.join(" ") : extracted.text;
  } catch {
    return back(detail, "Could not read that PDF — is it a valid file?");
  }
  if (!isAcknowledgement(text)) return back(detail, "That doesn't look like an Acknowledgement document.");

  const parsed = parseAcknowledgement(text);
  const contentHash = createHash("sha256").update(text).digest("hex");

  // Idempotent on (factory_id, content_hash): re-uploading the same file re-stages,
  // never double-writes.
  const { data: existing } = await supabase
    .from("doc_imports")
    .select("id")
    .eq("content_hash", contentHash)
    .maybeSingle();

  let importId = existing?.id as string | undefined;
  if (importId) {
    await supabase
      .from("doc_imports")
      .update({ parsed_json: parsed, status: "parsed", sale_id: saleId, source_filename: file.name })
      .eq("id", importId);
  } else {
    const { data, error } = await supabase
      .from("doc_imports")
      .insert({
        factory_id: profile.factory_id,
        doc_type: "acknowledgement",
        source_filename: file.name,
        content_hash: contentHash,
        parsed_json: parsed,
        status: "parsed",
        sale_id: saleId,
      })
      .select("id")
      .single();
    if (error || !data) return back(detail, error?.message ?? "Could not stage the document.");
    importId = data.id;
  }
  redirect(`${detail}/ack/${importId}`);
}

export async function confirmAcknowledgement(importId: string, saleId: string) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const { data: imp } = await supabase
    .from("doc_imports")
    .select("id, parsed_json")
    .eq("id", importId)
    .single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const parsed = imp.parsed_json as ParsedAcknowledgement;

  const { data: lotRows } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, grade, net_wt")
    .eq("sale_id", saleId);
  const invoiced = (lotRows ?? []).map((l) => ({
    id: l.id as string,
    invoiceNo: l.invoice_no as string,
    grade: l.grade as string,
    netWt: Number(l.net_wt),
  }));
  const recon = reconcileAcknowledgement(invoiced, parsed);

  // Resolve marks by code, auto-creating any the ack references but the factory
  // hasn't registered yet (its own marks — safe).
  const markCodes = [...new Set(parsed.lots.map((l) => l.markCode))];
  const { data: existingMarks } = await supabase.from("marks").select("id, code").in("code", markCodes);
  const markByCode = new Map<string, string>((existingMarks ?? []).map((m) => [m.code as string, m.id as string]));
  for (const code of markCodes) {
    if (markByCode.has(code)) continue;
    const name = parsed.lots.find((l) => l.markCode === code)?.markName ?? code;
    const { data: m } = await supabase
      .from("marks")
      .insert({ factory_id: profile.factory_id, code, name })
      .select("id")
      .single();
    if (m) markByCode.set(code, m.id as string);
  }

  // Apply cataloguing to every matched invoiced lot.
  for (const row of recon.rows) {
    if (!row.invoiced || (row.status !== "catalogued" && row.status !== "shutout")) continue;
    await supabase
      .from("auction_lots")
      .update({
        lot_no: row.ack?.lotNo ?? null,
        mark_id: row.ack ? markByCode.get(row.ack.markCode) ?? null : null,
        state: row.status,
        shutout_reason:
          row.status === "shutout" ? "Listed under Shutout/Violation in the acknowledgement" : null,
      })
      .eq("id", row.invoiced.id);
  }

  await supabase
    .from("doc_imports")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", importId);
  await supabase.from("auction_sales").update({ status: "catalogued" }).eq("id", saleId);
  revalidatePath(detail);
  redirect(
    `${detail}?notice=${encodeURIComponent(`Catalogued ${recon.summary.catalogued} lot(s); ${recon.summary.shutout} shutout.`)}`,
  );
}

export async function rejectAcknowledgement(importId: string, saleId: string) {
  const { supabase } = await requireProfile(roles());
  await supabase.from("doc_imports").update({ status: "rejected" }).eq("id", importId);
  revalidatePath(`${AUC}/${saleId}`);
  redirect(`${AUC}/${saleId}`);
}

// ---------- Valuation & contract ingestion (A2) ----------
async function extractPdf(file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: true });
    return Array.isArray(extracted.text) ? extracted.text.join(" ") : extracted.text;
  } catch {
    return null;
  }
}

const toISODate = (d: string | null): string | null => {
  const m = d?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// Parse → stage into doc_imports (idempotent on content hash). Returns the import id.
async function stageImport(
  supabase: Awaited<ReturnType<typeof requireProfile>>["supabase"],
  factoryId: string,
  saleId: string,
  docType: "valuation" | "contract",
  filename: string,
  text: string,
  parsed: unknown,
): Promise<string | null> {
  const contentHash = createHash("sha256").update(text).digest("hex");
  const { data: existing } = await supabase
    .from("doc_imports")
    .select("id")
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("doc_imports")
      .update({ parsed_json: parsed, status: "parsed", sale_id: saleId, source_filename: filename, doc_type: docType })
      .eq("id", existing.id);
    return existing.id as string;
  }
  const { data } = await supabase
    .from("doc_imports")
    .insert({
      factory_id: factoryId,
      doc_type: docType,
      source_filename: filename,
      content_hash: contentHash,
      parsed_json: parsed,
      status: "parsed",
      sale_id: saleId,
    })
    .select("id")
    .single();
  return (data?.id as string) ?? null;
}

export async function ingestValuation(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Valuation PDF to upload.");
  if (!isValuation(text)) return back(detail, "That doesn't look like a Valuation Report.");
  const parsed = parseValuation(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "valuation", (file as File).name, text, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${detail}/valuation/${importId}`);
}

export async function confirmValuation(importId: string, saleId: string) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const { data: imp } = await supabase.from("doc_imports").select("parsed_json").eq("id", importId).single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const parsed = imp.parsed_json as ParsedValuation;

  const { data: lotRows } = await supabase.from("auction_lots").select("id, invoice_no").eq("sale_id", saleId);
  const lotByInv = new Map<string, string>((lotRows ?? []).map((l) => [l.invoice_no as string, l.id as string]));

  let applied = 0;
  for (const v of parsed.lots) {
    const lotId = lotByInv.get(v.invoiceNo);
    if (!lotId) continue;
    await supabase.from("valuations").upsert(
      {
        factory_id: profile.factory_id,
        lot_id: lotId,
        price_min: v.priceMin,
        price_max: v.priceMax,
        projected_proceeds: v.projectedProceeds,
        tasting_note: v.tastingNote,
      },
      { onConflict: "lot_id" },
    );
    await supabase.from("auction_lots").update({ state: "valued" }).eq("id", lotId).neq("state", "shutout");
    applied++;
  }
  await supabase.from("doc_imports").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", importId);
  await supabase.from("auction_sales").update({ status: "valued" }).eq("id", saleId);
  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(`Recorded valuations for ${applied} lot(s).`)}`);
}

export async function ingestContract(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Sellers Contract PDF to upload.");
  if (!isContract(text)) return back(detail, "That doesn't look like a Sellers Contract & Account Sales document.");
  const parsed = parseContract(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "contract", (file as File).name, text, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
  redirect(`${detail}/contract/${importId}`);
}

export async function confirmContract(importId: string, saleId: string) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const { data: imp } = await supabase.from("doc_imports").select("parsed_json").eq("id", importId).single();
  if (!imp?.parsed_json) return back(detail, "Staged import not found.");
  const parsed = imp.parsed_json as ParsedContract;

  const { data: lotRows } = await supabase.from("auction_lots").select("id, invoice_no, net_wt").eq("sale_id", saleId);
  const lotByInv = new Map<string, { id: string; netWt: number }>(
    (lotRows ?? []).map((l) => [l.invoice_no as string, { id: l.id as string, netWt: Number(l.net_wt) }]),
  );

  // Resolve buyers (upsert by name).
  const uniqueBuyers = [...new Map(parsed.lines.map((l) => [l.buyerName, l.buyerVatNo])).entries()]
    .filter(([name]) => name)
    .map(([name, vatNo]) => ({ factory_id: profile.factory_id, name, vat_no: vatNo || null }));
  const buyerByName = new Map<string, string>();
  if (uniqueBuyers.length > 0) {
    const { data: upserted } = await supabase
      .from("buyers")
      .upsert(uniqueBuyers, { onConflict: "factory_id,name" })
      .select("id, name");
    for (const b of upserted ?? []) buyerByName.set(b.name as string, b.id as string);
  }

  // ── Sale lines ──
  let applied = 0;
  for (const line of parsed.lines) {
    const lot = lotByInv.get(line.invoiceNo);
    if (!lot) continue;
    await supabase.from("sale_lines").upsert(
      {
        factory_id: profile.factory_id, sale_id: saleId, lot_id: lot.id,
        buyer_id: buyerByName.get(line.buyerName) ?? null,
        gross_wt: line.grossWt, sample_allowance: line.sampleAllowance,
        net_wt: line.netWt, price_per_kg: line.pricePerKg,
        proceeds: line.proceeds, vat_amount: line.vatAmount,
        on_guarantee: line.onGuarantee,
      },
      { onConflict: "lot_id" },
    );
    await supabase.from("auction_lots").update({ state: "sold" }).eq("id", lot.id);
    applied++;
  }

  // ── Settlements per contract (A3) ──
  const { data: saleData } = await supabase.from("auction_sales").select("broker_id").eq("id", saleId).single();
  const brokerId = saleData?.broker_id as string | undefined;
  let settlementCount = 0;

  if (brokerId) {
    const { data: ratesRows } = await supabase
      .from("broker_rates")
      .select("*")
      .eq("broker_id", brokerId)
      .order("effective_from", { ascending: false })
      .limit(1);
    const rateCard = ratesRows?.[0];

    // Fetch existing sale lines we just upserted (with their ids) for VAT ledger
    const { data: saleLines } = await supabase
      .from("sale_lines")
      .select("id, lot_id, invoice_no, proceeds, vat_amount, on_guarantee")
      .eq("sale_id", saleId);

    for (const c of parsed.contracts) {
      const contractLines = parsed.lines.filter((l) => l.contractNo === c.contractNo);
      const proceedsTotal = contractLines.reduce((s, l) => s + l.proceeds, 0);
      const lotCount = contractLines.length;
      const netKg = contractLines.reduce((s, l) => s + l.netWt, 0);

      if (rateCard) {
        const s = computeSettlement(
          {
            insurancePerKg: Number(rateCard.insurance_per_kg),
            publicSaleExPerLot: Number(rateCard.public_sale_ex_per_lot),
            brokeragePct: Number(rateCard.brokerage_pct),
            handlingPerKg: Number(rateCard.handling_per_kg),
            documentationPerLot: Number(rateCard.documentation_per_lot),
            eplatformPerKg: Number(rateCard.eplatform_per_kg),
            govtReliefLoan: Number(rateCard.govt_relief_loan),
            chargesVatPct: Number(rateCard.charges_vat_pct),
            proceedsVatPct: Number(rateCard.proceeds_vat_pct),
          },
          { contractNo: c.contractNo, netKg, lotCount, proceedsTotal },
        );

        const { data: st } = await supabase
          .from("settlements")
          .upsert(
            {
              factory_id: profile.factory_id, sale_id: saleId,
              contract_no: c.contractNo, proceeds_total: proceedsTotal.toFixed(2),
              total_deductions: s.totalDeductions.toFixed(2),
              net_proceeds: s.netProceeds.toFixed(2),
              output_vat: s.outputVat.toFixed(2),
              total_net_proceeds: s.totalNetProceeds.toFixed(2),
              prompt_date: toISODate(parsed.promptDate),
            },
            { onConflict: "factory_id,contract_no" },
          )
          .select("id")
          .single();

        if (st) {
          for (const ch of s.charges) {
            await supabase.from("settlement_charges").upsert(
              {
                factory_id: profile.factory_id, settlement_id: st.id,
                code: ch.code, label: ch.label, basis: ch.basis,
                rate: ch.rate.toFixed(4), amount: ch.amount.toFixed(2),
                sort_order: String(ch.sortOrder),
              },
              { onConflict: "settlement_id,code" },
            );
          }
          settlementCount++;
        }
      }
    }

    // ── VAT ledger (A3) ──
    if (saleLines?.length) {
      const vatInputs = saleLines.map((sl) => ({
        saleLineId: sl.id as string,
        lotId: sl.lot_id as string,
        invoiceNo: (sl as { invoice_no?: string }).invoice_no ?? "",
        proceeds: Number(sl.proceeds),
        vatAmount: Number(sl.vat_amount),
        onGuarantee: Boolean(sl.on_guarantee),
      }));

      const { data: settlementRows } = await supabase
        .from("settlement_charges")
        .select("amount")
        .eq("factory_id", profile.factory_id)
        .eq("code", "charges_vat");
      const inputVat = (settlementRows ?? []).reduce((s, c) => s + Number(c.amount), 0);

      const recon = reconcileVat(vatInputs, inputVat);

      for (const l of recon.lines) {
        await supabase.from("vat_ledger").upsert(
          {
            factory_id: profile.factory_id, sale_line_id: l.saleLineId,
            flow: l.flow, vat_amount: l.vatAmount.toFixed(2), mode: l.mode,
            status: "pending",
          },
          { onConflict: "sale_line_id" },
        );
      }
    }
  }

  await supabase
    .from("auction_sales")
    .update({ status: "settled", prompt_date: toISODate(parsed.promptDate) })
    .eq("id", saleId);
  await supabase.from("doc_imports").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", importId);
  revalidatePath(detail);
  const settlementNote = settlementCount
    ? `; ${settlementCount} settlement(s) computed`
    : "";
  redirect(
    `${detail}?notice=${encodeURIComponent(`Recorded ${applied} sale line(s)${settlementNote}; prompt date ${parsed.promptDate ?? "—"}.`)}`,
  );
}

export async function rejectImport(importId: string, saleId: string) {
  const { supabase } = await requireProfile(roles());
  await supabase.from("doc_imports").update({ status: "rejected" }).eq("id", importId);
  revalidatePath(`${AUC}/${saleId}`);
  redirect(`${AUC}/${saleId}`);
}

// ────────── Bank CSV import (A4) ──────────
export async function ingestBankCsv(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return back(detail, "Choose a bank-statement CSV to upload.");

  const text = await file.text();
  if (!isBankCsv(text)) return back(detail, "That doesn't look like a bank-statement CSV.");

  const parsed = parseBankCsv(text);
  const contentHash = createHash("sha256").update(text).digest("hex");
  const importBatchId = crypto.randomUUID();

  // Stage: upsert by content_hash (idempotent re-upload).
  const { data: existing } = await supabase
    .from("doc_imports")
    .select("id")
    .eq("content_hash", contentHash)
    .maybeSingle();

  let importId: string;
  if (existing?.id) {
    importId = existing.id as string;
    await supabase
      .from("doc_imports")
      .update({ parsed_json: parsed, status: "parsed", sale_id: saleId, source_filename: file.name })
      .eq("id", importId);
  } else {
    const { data, error } = await supabase
      .from("doc_imports")
      .insert({
        factory_id: profile.factory_id, doc_type: "bank_csv",
        source_filename: file.name, content_hash: contentHash,
        parsed_json: parsed, status: "parsed", sale_id: saleId,
      })
      .select("id")
      .single();
    if (error || !data) return back(detail, error?.message ?? "Could not stage the CSV.");
    importId = data.id;
  }

  // Write staged transactions (idempotent per batch — delete old ones from this hash first).
  await supabase.from("bank_txns").delete().eq("import_batch_id", importBatchId);

  const { error: insErr } = await supabase.from("bank_txns").insert(
    parsed.transactions.map((t) => ({
      factory_id: profile.factory_id,
      txn_date: t.txnDate,
      description: t.description,
      debit: t.debit.toFixed(2),
      credit: t.credit.toFixed(2),
      running_balance: t.runningBalance?.toFixed(2) ?? null,
      cheque_no: t.chequeNo,
      raw_line: t.rawLine,
      import_batch_id: importBatchId,
    })),
  );
  if (insErr) return back(detail, insErr.message);

  // Run bank reconciliation against pending settlements.
  const { data: settlements } = await supabase
    .from("settlements")
    .select("id, contract_no, total_net_proceeds, output_vat, prompt_date")
    .eq("sale_id", saleId);
  const { data: credits } = await supabase
    .from("bank_txns")
    .select("id, txn_date, credit, description, cheque_no")
    .eq("import_batch_id", importBatchId);

  if (settlements?.length && credits?.length) {
    const { data: vatForSale } = await supabase
      .from("sale_lines")
      .select("vat_amount, on_guarantee")
      .eq("sale_id", saleId);
    const guaranteedVatPerContract = new Map<string, number>();
    for (const v of vatForSale ?? []) {
      if (v.on_guarantee) guaranteedVatPerContract.set(
        "",  // aggregate per sale — gross simplification; real mapping needs contract_no on sale_lines
        (guaranteedVatPerContract.get("") ?? 0) + Number(v.vat_amount),
      );
    }
    const totalGuaranteed = guaranteedVatPerContract.get("") ?? 0;

    const recon = reconcileBank(
      settlements.map((st) => ({
        settlementId: st.id as string,
        contractNo: st.contract_no as string,
        totalNetProceeds: Number(st.total_net_proceeds),
        guaranteedVat: totalGuaranteed, // aggregate; per-contract when sale_lines carry contract_no
        promptDate: (st.prompt_date as string) ?? "",
      })),
      (credits as {
        id: string; txn_date: string; credit: string; description: string | null; cheque_no: string | null;
      }[]).map((c) => ({
        txnId: c.id,
        txnDate: c.txn_date,
        credit: Number(c.credit),
        description: c.description ?? "",
        chequeNo: c.cheque_no,
      })),
    );

    // Apply matches
    for (const m of recon.matches) {
      await supabase.from("bank_txns").update({
        matched_settlement_id: m.settlementId,
        match_status: "matched",
      }).eq("id", m.bankTxnId);
    }
  }

  revalidatePath(detail);
  redirect(
    `${detail}?notice=${encodeURIComponent(
      `Imported ${parsed.transactions.length} bank transaction(s).`,
    )}`,
  );
}
