"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isBankCsv } from "@tea/api";
import { requireProfile } from "@/lib/profile";
import { AUC, roles, back, writeAudit, stageBankCsv, autoMatchBank } from "./_shared";

// ────────── Bank CSV import & reconciliation (A4) ──────────
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
