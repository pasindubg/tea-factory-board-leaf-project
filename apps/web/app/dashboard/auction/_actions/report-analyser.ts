"use server";

import { redirect } from "next/navigation";
import { isBankCsv } from "@tea/api";
import { requireModuleAccess } from "@/lib/profile";
import { AUC, back, stageBankCsv } from "./_shared";

const DOCS = `${AUC}/documents`;

// Bank CSVs aren't tied to one sale by the broker, so this auto-attaches the
// import to the most recent dispatch invoice — the Documents page's own upload
// assistant, not a per-sale form.
export async function ingestBankAuto(formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return back(DOCS, "Choose a bank CSV.");
  const text = await file.text();
  if (!isBankCsv(text)) return back(DOCS, "Not a valid bank CSV.");
  const { data: lastSale } = await supabase.from("auction_sales").select("id").eq("factory_id", profile.factory_id).order("created_at", { ascending: false }).limit(1).single();
  const saleId = (lastSale?.id as string) ?? null;
  if (!saleId) return back(DOCS, "No dispatch invoice found. Create one first.");
  const staged = await stageBankCsv(supabase, profile.factory_id, saleId, file, text, false);
  if ("error" in staged) return back(DOCS, staged.error);
  redirect(`${DOCS}/${staged.importId}`);
}
