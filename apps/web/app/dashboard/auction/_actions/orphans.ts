"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { requireModuleAccess } from "@/lib/profile";
import { AUC, writeAudit } from "./_shared";

// ---------- Orphan resolver ----------
export async function linkOrphanLot(input: {
  saleId: string;
  lotId: string;
  candidateLotNo: string | null;
  candidateMarkCode: string | null;
  candidateNetWt: number;
  confidence: number;
  reason?: string;
}): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const candidateNetWt = Number(input.candidateNetWt);
  const confidence = Number(input.confidence);
  if (!Number.isFinite(candidateNetWt) || candidateNetWt < 0) {
    return { ok: false, error: "The candidate weight is invalid. Refresh and try again." };
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "The displayed match confidence is invalid. Refresh and try again." };
  }

  const { data: lot, error: lotError } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, net_wt, lot_no, mark_id, state, shutout_reason")
    .eq("id", input.lotId)
    .eq("sale_id", input.saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: "The unresolved invoice was not found for this Broker Invoice." };

  let markId: string | null = null;
  if (input.candidateMarkCode) {
    const { data: mark, error: markError } = await supabase
      .from("marks")
      .select("id")
      .eq("factory_id", profile.factory_id)
      .eq("code", input.candidateMarkCode)
      .maybeSingle();
    if (markError) return { ok: false, error: friendlyError(markError) };
    if (!mark) return { ok: false, error: "The candidate selling mark is not registered for this factory." };
    markId = mark.id as string;
  }

  const { data: updated, error: updateError } = await supabase
    .from("auction_lots")
    .update({
      lot_no: input.candidateLotNo,
      mark_id: markId,
      state: "acknowledged",
      shutout_reason: null,
    })
    .eq("id", input.lotId)
    .eq("sale_id", input.saleId)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, error: friendlyError(updateError) };
  if (!updated) return { ok: false, error: "The unresolved invoice changed before it could be linked. Refresh and try again." };

  const weightDelta = Number((candidateNetWt - Number(lot.net_wt)).toFixed(2));
  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId: input.saleId,
    lotId: input.lotId,
    action: "Linked",
    detail: `Invoice ${lot.invoice_no as string} → lot ${input.candidateLotNo ?? "—"}`,
    reason: input.reason?.trim().slice(0, 500) || undefined,
    actor: profile.name,
    confidenceShown: confidence,
    weightDelta: weightDelta !== 0 ? weightDelta : null,
  });
  if (auditError) {
    const { error: rollbackError } = await supabase
      .from("auction_lots")
      .update({
        lot_no: lot.lot_no,
        mark_id: lot.mark_id,
        state: lot.state,
        shutout_reason: lot.shutout_reason,
      })
      .eq("id", input.lotId)
      .eq("sale_id", input.saleId)
      .eq("factory_id", profile.factory_id)
      .eq("state", "acknowledged");
    if (rollbackError) {
      return { ok: false, error: "The lot was linked, but its audit entry could not be saved. Review this reconciliation before retrying." };
    }
    return { ok: false, error: friendlyError(auditError) };
  }

  revalidatePath(`${AUC}/${input.saleId}`);
  return { ok: true, notice: "Invoice and catalogue lot linked." };
}

// The three resolver outcomes differ only by their state patch and audit label.
// Every write is scoped to the selected Broker Invoice in the current factory.
type OrphanStateInput = { saleId: string; lotId: string; reason?: string };

async function setOrphanState(
  input: OrphanStateInput,
  patch: Record<string, string | null>,
  action: string,
  notice: string,
): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { data: lot, error: lotError } = await supabase
    .from("auction_lots")
    .select("id, invoice_no, state, shutout_reason")
    .eq("id", input.lotId)
    .eq("sale_id", input.saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: "The unresolved invoice was not found for this Broker Invoice." };

  const { data: updated, error: updateError } = await supabase
    .from("auction_lots")
    .update(patch)
    .eq("id", input.lotId)
    .eq("sale_id", input.saleId)
    .eq("factory_id", profile.factory_id)
    .select("id")
    .maybeSingle();
  if (updateError) return { ok: false, error: friendlyError(updateError) };
  if (!updated) return { ok: false, error: "The unresolved invoice changed before the outcome could be saved. Refresh and try again." };

  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId: input.saleId,
    lotId: input.lotId,
    action,
    detail: `Invoice ${lot.invoice_no as string}`,
    reason: input.reason?.trim().slice(0, 500) || undefined,
    actor: profile.name,
  });
  if (auditError) {
    const { error: rollbackError } = await supabase
      .from("auction_lots")
      .update({ state: lot.state, shutout_reason: lot.shutout_reason })
      .eq("id", input.lotId)
      .eq("sale_id", input.saleId)
      .eq("factory_id", profile.factory_id)
      .eq("state", patch.state);
    if (rollbackError) {
      return { ok: false, error: "The invoice outcome changed, but its audit entry could not be saved. Review this reconciliation before retrying." };
    }
    return { ok: false, error: friendlyError(auditError) };
  }

  revalidatePath(`${AUC}/${input.saleId}`);
  return { ok: true, notice };
}

export async function markShutout(input: OrphanStateInput): Promise<ListMutationResult> {
  return setOrphanState(input, { state: "shutout", shutout_reason: "Marked shut out" }, "Marked shut out", "Invoice marked as shut out.");
}

export async function markMissing(input: OrphanStateInput): Promise<ListMutationResult> {
  return setOrphanState(input, { state: "missing" }, "Marked missing", "Invoice marked as missing.");
}

export async function markPending(input: OrphanStateInput): Promise<ListMutationResult> {
  return setOrphanState(input, { state: "pending", shutout_reason: null }, "Left unresolved", "Invoice left unresolved.");
}

export async function rejectCandidate(input: {
  saleId: string;
  lotId: string;
  candidateLotNo: string | null;
}): Promise<ListMutationResult> {
  const { supabase, profile } = await requireModuleAccess("auction");
  const { data: lot, error: lotError } = await supabase
    .from("auction_lots")
    .select("id, invoice_no")
    .eq("id", input.lotId)
    .eq("sale_id", input.saleId)
    .eq("factory_id", profile.factory_id)
    .maybeSingle();
  if (lotError) return { ok: false, error: friendlyError(lotError) };
  if (!lot) return { ok: false, error: "The unresolved invoice was not found for this Broker Invoice." };

  const { error: auditError } = await writeAudit(supabase, profile.factory_id, {
    saleId: input.saleId,
    lotId: input.lotId,
    action: "Rejected",
    detail: `Lot ${input.candidateLotNo ?? "—"} rejected for invoice ${lot.invoice_no as string}`,
    actor: profile.name,
  });
  if (auditError) return { ok: false, error: friendlyError(auditError) };

  revalidatePath(`${AUC}/${input.saleId}`);
  return { ok: true, notice: "Candidate rejected for this invoice." };
}
