"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import {
  isAcknowledgement,
  parseAcknowledgement,
  reconcileAcknowledgement,
  type ParsedAcknowledgement,
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
