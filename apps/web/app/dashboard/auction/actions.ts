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
const REP = "/dashboard/auction/reports";
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());
const roles = () => getDefaultRoles("auction");
const back = (path: string, error: string): never => redirect(`${path}?error=${encodeURIComponent(error)}`);

type Supa = Awaited<ReturnType<typeof requireProfile>>["supabase"];
type DocType = "acknowledgement" | "valuation" | "contract" | "bank_csv";

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
  if (!saleNo) back(np, "Dispatch number is required.");
  const { data, error } = await supabase
    .from("auction_sales")
    .insert({
      factory_id: profile.factory_id,
      broker_id: brokerId,
      sale_no: saleNo,
      sale_date: str(formData.get("sale_date")) || null,
      target_sale_no: str(formData.get("target_sale_no")) || null,
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
  redirect(AUC);
}

export async function updateSale(id: string, formData: FormData) {
  const { supabase } = await requireProfile(["owner"]);
  const updates: Record<string, string | null> = {};
  const status = str(formData.get("status"));
  const target = str(formData.get("target_sale_no"));
  const saleNo = str(formData.get("sale_no"));
  const saleDate = str(formData.get("sale_date"));
  const dispatchDate = str(formData.get("dispatch_date"));
  if (status) updates.status = status;
  if (target) updates.target_sale_no = target || null;
  if (saleNo) updates.sale_no = saleNo;
  if (saleDate) updates.sale_date = saleDate;
  if (dispatchDate) updates.dispatch_date = dispatchDate;
  if (Object.keys(updates).length > 0) {
    await supabase.from("auction_sales").update(updates).eq("id", id);
  }
  revalidatePath(AUC);
}

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

// ---------- Orphan resolver & audit ----------
async function writeAudit(supabase: Supa, factoryId: string, row: {
  saleId?: string | null; lotId?: string | null; action: string; detail: string;
  reason?: string | null; actor: string; confidenceShown?: number | null; weightDelta?: number | null;
}) {
  await supabase.from("auction_audit").insert({
    factory_id: factoryId, sale_id: row.saleId ?? null, lot_id: row.lotId ?? null,
    action: row.action, detail: row.detail, reason: row.reason ?? null, actor: row.actor,
    confidence_shown: row.confidenceShown != null ? row.confidenceShown.toFixed(4) : null,
    weight_delta: row.weightDelta != null ? row.weightDelta.toFixed(2) : null,
  });
}

export async function linkOrphanLot(input: {
  saleId: string; lotId: string; invoiceNo: string; orphanNetWt: number;
  candidateLotNo: string | null; candidateMarkCode: string | null; candidateGrade: string; candidateNetWt: number;
  confidence: number; reason?: string;
}) {
  const { supabase, profile } = await requireProfile(roles());
  const markId = input.candidateMarkCode ? (await supabase.from("marks").select("id").eq("code", input.candidateMarkCode).maybeSingle()).data?.id as string ?? null : null;
  const weightDelta = Number((input.candidateNetWt - input.orphanNetWt).toFixed(2));
  await supabase.from("auction_lots").update({ lot_no: input.candidateLotNo, mark_id: markId, state: "catalogued", shutout_reason: null }).eq("id", input.lotId).eq("sale_id", input.saleId);
  await writeAudit(supabase, profile.factory_id, { saleId: input.saleId, lotId: input.lotId, action: "Linked", detail: `Invoice ${input.invoiceNo} → lot ${input.candidateLotNo ?? "—"}`, reason: input.reason, actor: profile.name, confidenceShown: input.confidence, weightDelta: weightDelta !== 0 ? weightDelta : null });
  revalidatePath(`${AUC}/${input.saleId}`);
}

// The three "leave this orphan in state X" resolver actions differ only by the
// column patch and the audit label, so they share one body. The sale_id guard is
// belt-and-suspenders on top of RLS — a lot can only be moved within its own sale.
type OrphanStateInput = { saleId: string; lotId: string; invoiceNo: string; orphanGrade: string; orphanNetWt: number; reason?: string };

async function setOrphanState(input: OrphanStateInput, patch: Record<string, string | null>, action: string) {
  const { supabase, profile } = await requireProfile(roles());
  await supabase.from("auction_lots").update(patch).eq("id", input.lotId).eq("sale_id", input.saleId);
  await writeAudit(supabase, profile.factory_id, { saleId: input.saleId, lotId: input.lotId, action, detail: `Invoice ${input.invoiceNo}`, actor: profile.name });
  revalidatePath(`${AUC}/${input.saleId}`);
}

export async function markShutout(input: OrphanStateInput) {
  await setOrphanState(input, { state: "shutout", shutout_reason: "Marked shut out" }, "Marked shut out");
}

export async function markMissing(input: OrphanStateInput) {
  await setOrphanState(input, { state: "missing" }, "Marked missing");
}

export async function markPending(input: OrphanStateInput) {
  await setOrphanState(input, { state: "pending", shutout_reason: null }, "Left unresolved");
}

export async function rejectCandidate(input: { saleId: string; lotId: string; invoiceNo: string; candidateLotNo: string | null }) {
  const { supabase, profile } = await requireProfile(roles());
  await writeAudit(supabase, profile.factory_id, { saleId: input.saleId, lotId: input.lotId, action: "Rejected", detail: `Lot ${input.candidateLotNo ?? "—"} rejected for invoice ${input.invoiceNo}`, actor: profile.name });
  revalidatePath(`${AUC}/${input.saleId}`);
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

export async function confirmBankMatches(saleId: string, importId: string) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const applied = await autoMatchBank(supabase, saleId, importId);
  if (applied > 0) await writeAudit(supabase, profile.factory_id, { saleId, action: "Bank auto-matched", detail: `${applied} credits matched`, actor: profile.name });
  redirect(`${detail}/bank/${importId}?notice=${encodeURIComponent(`Applied ${applied} match(es).`)}`);
}

export async function linkBankCredit(input: { saleId: string; importId: string; txnId: string; settlementId: string; contractNo: string; credit: number; confidence: number; reason?: string }) {
  const { supabase, profile } = await requireProfile(roles());
  await supabase.from("bank_txns").update({ matched_settlement_id: input.settlementId, match_status: "matched" }).eq("id", input.txnId);
  await writeAudit(supabase, profile.factory_id, { saleId: input.saleId, action: "Bank linked", detail: `Credit ${input.credit.toFixed(2)} → ${input.contractNo}`, actor: profile.name, confidenceShown: input.confidence });
  revalidatePath(`${AUC}/${input.saleId}/bank/${input.importId}`);
}

// Only invoiced lots can be removed by hand (to fix entry mistakes).
export async function deleteLot(id: string, saleId: string) {
  const { supabase } = await requireProfile(roles());
  await supabase.from("auction_lots").delete().eq("id", id).in("state", ["invoiced", "dispatched", "pending"]);
  revalidatePath(`${AUC}/${saleId}`);
}

// ---------- Acknowledgement ingestion (parse → stage → review → confirm) ----------
export async function ingestAcknowledgement(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(detail, "Choose a valid Acknowledgement PDF to upload.");
  if (!isAcknowledgement(text)) return back(detail, "That doesn't look like an Acknowledgement document.");
  const parsed = parseAcknowledgement(text);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "acknowledgement", (file as File).name, text, parsed);
  if (!importId) return back(detail, "Could not stage the document.");
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

  // Remaining dispatched lots not in this ack → pending (may be in a later ack).
  await supabase.from("auction_lots").update({ state: "pending" }).eq("sale_id", saleId).eq("state", "invoiced");

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

// Parse → stage into doc_imports (idempotent on factory_id + content hash).
// Returns the import id. The single staging path for every document type — the
// four ingest flows used to each carry their own near-identical copy.
async function stageImport(
  supabase: Supa,
  factoryId: string,
  saleId: string,
  docType: DocType,
  filename: string,
  text: string,
  parsed: unknown,
): Promise<string | null> {
  const contentHash = createHash("sha256").update(text).digest("hex");
  const { data: existing } = await supabase
    .from("doc_imports")
    .select("id")
    .eq("factory_id", factoryId)
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
// Stage a bank CSV and (re)write its transactions, keyed to the doc_import id.
// The review page reads bank_txns by import_batch_id = importId, so keying on the
// doc_import id is what makes them visible — and makes a re-upload replace the
// previous batch instead of leaving orphaned duplicates. Optionally auto-matches.
async function stageBankCsv(
  supabase: Supa,
  factoryId: string,
  saleId: string,
  file: File,
  text: string,
  autoMatch: boolean,
): Promise<{ importId: string; count: number } | { error: string }> {
  const parsed = parseBankCsv(text);
  const importId = await stageImport(supabase, factoryId, saleId, "bank_csv", file.name, text, parsed);
  if (!importId) return { error: "Could not stage the CSV." };

  await supabase.from("bank_txns").delete().eq("import_batch_id", importId);
  const { error: insErr } = await supabase.from("bank_txns").insert(
    parsed.transactions.map((t) => ({
      factory_id: factoryId,
      txn_date: t.txnDate,
      description: t.description,
      debit: t.debit.toFixed(2),
      credit: t.credit.toFixed(2),
      running_balance: t.runningBalance?.toFixed(2) ?? null,
      cheque_no: t.chequeNo,
      raw_line: t.rawLine,
      import_batch_id: importId,
    })),
  );
  if (insErr) return { error: insErr.message };

  if (autoMatch) await autoMatchBank(supabase, saleId, importId);
  return { importId, count: parsed.transactions.length };
}

// Reconcile a batch's still-unmatched credits against the sale's settlements and
// apply the high-confidence matches. Returns how many were applied. Shared by the
// ingest path and the "apply suggested matches" action.
async function autoMatchBank(supabase: Supa, saleId: string, importId: string): Promise<number> {
  const { data: settlements } = await supabase
    .from("settlements")
    .select("id, contract_no, total_net_proceeds, prompt_date")
    .eq("sale_id", saleId);
  const { data: credits } = await supabase
    .from("bank_txns")
    .select("id, txn_date, credit, description, cheque_no")
    .eq("import_batch_id", importId)
    .is("matched_settlement_id", null);
  if (!settlements?.length || !credits?.length) return 0;
  const { data: vatForSale } = await supabase
    .from("sale_lines")
    .select("vat_amount, on_guarantee")
    .eq("sale_id", saleId);
  const guaranteedVat = (vatForSale ?? []).filter((v) => v.on_guarantee).reduce((s, v) => s + Number(v.vat_amount ?? 0), 0);
  const recon = reconcileBank(
    settlements.map((st) => ({
      settlementId: st.id as string,
      contractNo: st.contract_no as string,
      totalNetProceeds: Number(st.total_net_proceeds),
      guaranteedVat,
      promptDate: (st.prompt_date as string) ?? "",
    })),
    credits.map((c) => ({
      txnId: c.id as string,
      txnDate: c.txn_date as string,
      credit: Number(c.credit),
      description: (c.description as string) ?? "",
      chequeNo: c.cheque_no as string | null,
    })),
  );
  await Promise.all(
    recon.matches.map((m) =>
      supabase.from("bank_txns").update({ matched_settlement_id: m.settlementId, match_status: "matched" }).eq("id", m.bankTxnId),
    ),
  );
  return recon.matches.length;
}

export async function ingestBankCsv(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const detail = `${AUC}/${saleId}`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return back(detail, "Choose a bank-statement CSV to upload.");
  const text = await file.text();
  if (!isBankCsv(text)) return back(detail, "That doesn't look like a bank-statement CSV.");
  const staged = await stageBankCsv(supabase, profile.factory_id, saleId, file, text, true);
  if ("error" in staged) return back(detail, staged.error);
  revalidatePath(detail);
  redirect(`${detail}?notice=${encodeURIComponent(`Imported ${staged.count} bank transaction(s).`)}`);
}

// ─── Report Analyser: auto-detect sale from document ───
async function resolveSale(
  supabase: Supa,
  factoryId: string,
  saleNo: string | null,
): Promise<string | null> {
  const sn = saleNo?.trim();
  if (!sn) return null;
  const { data: existing } = await supabase
    .from("auction_sales")
    .select("id")
    .eq("sale_no", sn)
    .eq("factory_id", factoryId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: br } = await supabase.from("brokers").select("id").eq("factory_id", factoryId).limit(1).single();
  if (!br?.id) return null;
  const { data: created } = await supabase
    .from("auction_sales")
    .insert({ factory_id: factoryId, broker_id: br.id, sale_no: sn, status: "dispatched" })
    .select("id")
    .single();
  return (created?.id as string) ?? null;
}

export async function ingestAckAuto(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(REP, "Choose a valid Acknowledgement PDF.");
  if (!isAcknowledgement(text)) return back(REP, "Not a valid Acknowledgement.");
  const parsed = parseAcknowledgement(text);
  const saleId = await resolveSale(supabase, profile.factory_id, parsed.saleNo);
  if (!saleId) return back(REP, `No dispatch found for sale ${parsed.saleNo ?? "?"}. Create one first.`);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "acknowledgement", (file as File).name, text, parsed);
  if (!importId) return back(REP, "Could not stage.");
  redirect(`${AUC}/${saleId}/ack/${importId}`);
}

export async function ingestValAuto(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (!text) return back(REP, "Choose a valid Valuation PDF.");
  if (!isValuation(text)) return back(REP, "Not a valid Valuation Report.");
  const parsed = parseValuation(text);
  const saleId = await resolveSale(supabase, profile.factory_id, parsed.saleNo);
  if (!saleId) return back(REP, `No dispatch found for sale ${parsed.saleNo ?? "?"}. Create one first.`);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "valuation", (file as File).name, text, parsed);
  if (!importId) return back(REP, "Could not stage.");
  redirect(`${AUC}/${saleId}/valuation/${importId}`);
}

export async function ingestConAuto(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (!text) return back(REP, "Choose a valid Contract PDF.");
  if (!isContract(text)) return back(REP, "Not a valid Sellers Contract.");
  const parsed = parseContract(text);
  const saleId = await resolveSale(supabase, profile.factory_id, parsed.saleNo);
  if (!saleId) return back(REP, `No dispatch found for sale ${parsed.saleNo ?? "?"}. Create one first.`);
  const importId = await stageImport(supabase, profile.factory_id, saleId, "contract", (file as File).name, text, parsed);
  if (!importId) return back(REP, "Could not stage.");
  redirect(`${AUC}/${saleId}/contract/${importId}`);
}

export async function ingestBankAuto(formData: FormData) {
  const { supabase, profile } = await requireProfile(roles());
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return back(REP, "Choose a bank CSV.");
  const text = await file.text();
  if (!isBankCsv(text)) return back(REP, "Not a valid bank CSV.");
  // Bank CSVs don't carry sale_no; attach to the most recent dispatch.
  const { data: lastSale } = await supabase.from("auction_sales").select("id").eq("factory_id", profile.factory_id).order("created_at", { ascending: false }).limit(1).single();
  const saleId = (lastSale?.id as string) ?? null;
  if (!saleId) return back(REP, "No dispatch found. Create one first.");
  const staged = await stageBankCsv(supabase, profile.factory_id, saleId, file, text, false);
  if ("error" in staged) return back(REP, staged.error);
  redirect(`${AUC}/${saleId}/bank/${staged.importId}`);
}
