"use server";

import { redirect } from "next/navigation";
import {
  isAcknowledgement,
  parseAcknowledgement,
  isValuation,
  parseValuation,
  isContract,
  parseContract,
  isBankCsv,
} from "@tea/api";
import { requireModuleAccess } from "@/lib/profile";
import { AUC, REP, back, extractPdf, stageImport, resolveSale, stageBankCsv } from "./_shared";

// ─── Report Analyser: auto-detect the dispatch from the document, then stage ───
export async function ingestAckAuto(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (text === null) return back(REP, "Choose a valid Acknowledgement PDF.");
  if (!isAcknowledgement(text)) return back(REP, "Not a valid Acknowledgement.");
  const parsed = parseAcknowledgement(text);
  const saleId = await resolveSale(supabase, profile.factory_id, parsed.saleNo);
  if (!saleId) return back(REP, `No broker invoice found for sale ${parsed.saleNo ?? "?"}. Create one first.`);
  const staged = await stageImport(supabase, profile.factory_id, saleId, "acknowledgement", file as File, parsed);
  if (!staged.ok) return back(REP, staged.error);
  redirect(`${AUC}/${saleId}/ack/${staged.importId}`);
}

export async function ingestValAuto(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (!text) return back(REP, "Choose a valid Valuation PDF.");
  if (!isValuation(text)) return back(REP, "Not a valid Valuation Report.");
  const parsed = parseValuation(text);
  const saleId = await resolveSale(supabase, profile.factory_id, parsed.saleNo);
  if (!saleId) return back(REP, `No broker invoice found for sale ${parsed.saleNo ?? "?"}. Create one first.`);
  const staged = await stageImport(supabase, profile.factory_id, saleId, "valuation", file as File, parsed);
  if (!staged.ok) return back(REP, staged.error);
  redirect(`${AUC}/${saleId}/valuation/${staged.importId}`);
}

export async function ingestConAuto(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const file = formData.get("file");
  const text = await extractPdf(file);
  if (!text) return back(REP, "Choose a valid Contract PDF.");
  if (!isContract(text)) return back(REP, "Not a valid Sellers Contract.");
  const parsed = parseContract(text);
  const saleId = await resolveSale(supabase, profile.factory_id, parsed.saleNo);
  if (!saleId) return back(REP, `No broker invoice found for sale ${parsed.saleNo ?? "?"}. Create one first.`);
  const staged = await stageImport(supabase, profile.factory_id, saleId, "contract", file as File, parsed);
  if (!staged.ok) return back(REP, staged.error);
  redirect(`${AUC}/${saleId}/contract/${staged.importId}`);
}

export async function ingestBankAuto(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return back(REP, "Choose a bank CSV.");
  const text = await file.text();
  if (!isBankCsv(text)) return back(REP, "Not a valid bank CSV.");
  // Bank CSVs don't carry sale_no; attach to the most recent dispatch.
  const { data: lastSale } = await supabase.from("auction_sales").select("id").eq("factory_id", profile.factory_id).order("created_at", { ascending: false }).limit(1).single();
  const saleId = (lastSale?.id as string) ?? null;
  if (!saleId) return back(REP, "No broker invoice found. Create one first.");
  const staged = await stageBankCsv(supabase, profile.factory_id, saleId, file, text, false);
  if ("error" in staged) return back(REP, staged.error);
  redirect(`${AUC}/${saleId}/bank/${staged.importId}`);
}
