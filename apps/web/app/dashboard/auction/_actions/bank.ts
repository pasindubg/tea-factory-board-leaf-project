"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isBankCsv } from "@tea/api";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireModuleAccess } from "@/lib/profile";
import { AUC, back, writeAudit, stageBankCsv, autoMatchBank } from "./_shared";

// ────────── Bank CSV import & reconciliation (A4) ──────────
export async function ingestBankCsv(saleId: string, formData: FormData) {
  const { supabase, profile } = await requireModuleAccess("auction");
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
  const { supabase, profile } = await requireModuleAccess("auction");
  const detail = `${AUC}/${saleId}`;
  const matched = await autoMatchBank(supabase, saleId, importId);
  if (!matched.ok) return back(`${detail}/bank/${importId}`, matched.error);
  if (matched.count > 0) {
    const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
      saleId,
      action: "Bank auto-matched",
      detail: `${matched.count} credits matched`,
      actor: profile.name,
    });
    if (auditError) return back(`${detail}/bank/${importId}`, friendlyError(auditError));
  }
  redirect(`${detail}/bank/${importId}?notice=${encodeURIComponent(`Applied ${matched.count} match(es).`)}`);
}

export async function linkBankCredit(input: {
  saleId: string;
  importId: string;
  txnId: string;
  settlementId: string;
  confidence: number;
  reason?: string;
}): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "The displayed match confidence is invalid. Refresh and try again." };
  }

  // Both foreign identifiers are browser input. Resolve the import and
  // settlement through the scoped client before touching the credit row.
  const [{ data: bankImport, error: importError }, { data: settlement, error: settlementError }] = await Promise.all([
    supabase
      .from("doc_imports")
      .select("id")
      .eq("id", input.importId)
      .eq("factory_id", profile.factory_id)
      .eq("sale_id", input.saleId)
      .eq("doc_type", "bank_csv")
      .maybeSingle(),
    supabase
      .from("settlements")
      .select("id, contract_no")
      .eq("id", input.settlementId)
      .eq("factory_id", profile.factory_id)
      .eq("sale_id", input.saleId)
      .maybeSingle(),
  ]);
  if (importError) return { ok: false, error: friendlyError(importError) };
  if (settlementError) return { ok: false, error: friendlyError(settlementError) };
  if (!bankImport) return { ok: false, error: "This bank import does not belong to the selected sale." };
  if (!settlement) return { ok: false, error: "The selected settlement was not found for this sale." };

  const { data: txn, error: updateError } = await supabase
    .from("bank_txns")
    .update({ matched_settlement_id: input.settlementId, match_status: "matched" })
    .eq("id", input.txnId)
    .eq("factory_id", profile.factory_id)
    .eq("import_batch_id", input.importId)
    .is("matched_settlement_id", null)
    .select("id, credit")
    .maybeSingle();
  if (updateError) return { ok: false, error: friendlyError(updateError) };
  if (!txn) return { ok: false, error: "This credit was not found in the import or has already been linked." };

  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId: input.saleId,
    action: "Bank linked",
    detail: `Credit ${Number(txn.credit).toFixed(2)} → ${settlement.contract_no as string}`,
    reason: input.reason?.trim().slice(0, 500) || undefined,
    actor: profile.name,
    confidenceShown: confidence,
  });
  if (auditError) {
    // The link and audit are separate PostgREST statements. Restore the prior
    // unmatched state when the audit write fails so the workflow never reports
    // an unaudited decision as successful.
    const { error: rollbackError } = await supabase
      .from("bank_txns")
      .update({ matched_settlement_id: null, match_status: "unmatched" })
      .eq("id", input.txnId)
      .eq("factory_id", profile.factory_id)
      .eq("import_batch_id", input.importId)
      .eq("matched_settlement_id", input.settlementId);
    if (rollbackError) {
      return { ok: false, error: "The credit was linked, but its audit entry could not be saved. Review this reconciliation before retrying." };
    }
    return { ok: false, error: friendlyError(auditError) };
  }
  revalidatePath(`${AUC}/${input.saleId}/bank/${input.importId}`);
  return { ok: true, notice: "Bank credit linked." };
}
