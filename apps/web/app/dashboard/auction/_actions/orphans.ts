"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/profile";
import { AUC, writeAudit } from "./_shared";

// ---------- Orphan resolver ----------
export async function linkOrphanLot(input: {
  saleId: string; lotId: string; invoiceNo: string; orphanNetWt: number;
  candidateLotNo: string | null; candidateMarkCode: string | null; candidateGrade: string; candidateNetWt: number;
  confidence: number; reason?: string;
}) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const markId = input.candidateMarkCode ? (await supabase.from("marks").select("id").eq("code", input.candidateMarkCode).maybeSingle()).data?.id as string ?? null : null;
  const weightDelta = Number((input.candidateNetWt - input.orphanNetWt).toFixed(2));
  await supabase.from("auction_lots").update({ lot_no: input.candidateLotNo, mark_id: markId, state: "acknowledged", shutout_reason: null }).eq("id", input.lotId).eq("sale_id", input.saleId);
  await writeAudit(supabase, profile.factory_id, { saleId: input.saleId, lotId: input.lotId, action: "Linked", detail: `Invoice ${input.invoiceNo} → lot ${input.candidateLotNo ?? "—"}`, reason: input.reason, actor: profile.name, confidenceShown: input.confidence, weightDelta: weightDelta !== 0 ? weightDelta : null });
  revalidatePath(`${AUC}/${input.saleId}`);
}

// The three "leave this orphan in state X" resolver actions differ only by the
// column patch and the audit label, so they share one body. The sale_id guard is
// belt-and-suspenders on top of RLS — a lot can only be moved within its own sale.
type OrphanStateInput = { saleId: string; lotId: string; invoiceNo: string; orphanGrade: string; orphanNetWt: number; reason?: string };

async function setOrphanState(input: OrphanStateInput, patch: Record<string, string | null>, action: string) {
  const { supabase, profile } = await requireModuleAccess("auction");
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
  const { supabase, profile } = await requireModuleAccess("auction");
  await writeAudit(supabase, profile.factory_id, { saleId: input.saleId, lotId: input.lotId, action: "Rejected", detail: `Lot ${input.candidateLotNo ?? "—"} rejected for invoice ${input.invoiceNo}`, actor: profile.name });
  revalidatePath(`${AUC}/${input.saleId}`);
}
