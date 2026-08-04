"use server";

import { revalidatePath } from "next/cache";
import { requirePagePermission } from "@/lib/profile";
import type { Role } from "@/lib/roles";
import { friendlyError } from "@/lib/errors";
import type { ListMutationResult } from "@/lib/list-mutations";
import { AUC, str } from "./_shared";
import { createDispatchFromApprovedException } from "./sales";
import { createLotFromApprovedException } from "./lots";

// Any auction-module role can view this page (to see their own submitted
// requests), but only owner/manager/supervisor may decide one — accountant
// is the only role today that can end up submitting an exception in the
// first place, and must not be able to approve their own request.
const DECIDE_ROLES: readonly Role[] = ["owner", "manager", "supervisor"];

export async function approveInvoicePrefixException(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("auction-prefix-approvals", "update");
  if (!DECIDE_ROLES.includes(profile.role)) {
    return { ok: false, error: "Only owner, manager, or supervisor can decide prefix exceptions." };
  }
  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Select a pending request to approve." };

  const { data: exception, error: fetchError } = await supabase
    .from("invoice_prefix_exceptions")
    .update({ status: "approved", decided_by: profile.id, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .eq("status", "pending")
    .select("id, category, context_id, payload, requested_prefix_id")
    .maybeSingle();
  if (fetchError) return { ok: false, error: friendlyError(fetchError) };
  if (!exception) return { ok: false, error: "This request is no longer pending. Refresh and try again." };

  const payload = (exception.payload ?? {}) as Record<string, unknown>;
  const category = exception.category as string;
  const requestedPrefixId = exception.requested_prefix_id as string;
  const result = category === "broker_invoice"
    ? await createDispatchFromApprovedException(payload, requestedPrefixId)
    : await createLotFromApprovedException(exception.context_id as string, payload, requestedPrefixId);

  if (!result.ok) {
    await supabase.from("invoice_prefix_exceptions")
      .update({ note: result.error })
      .eq("id", id)
      .eq("factory_id", profile.factory_id);
    revalidatePath(`${AUC}/prefix-approvals`);
    return { ok: false, error: `Approved, but the record could not be created: ${result.error}` };
  }
  await supabase.from("invoice_prefix_exceptions")
    .update({ created_record_id: result.id })
    .eq("id", id)
    .eq("factory_id", profile.factory_id);

  revalidatePath(`${AUC}/prefix-approvals`);
  return { ok: true, notice: "Approved and created.", invalidate: [
    { kind: "exact", resource: { key: "auction.prefix-approvals" } },
  ] };
}

export async function declineInvoicePrefixException(formData: FormData): Promise<ListMutationResult> {
  const { supabase, profile } = await requirePagePermission("auction-prefix-approvals", "update");
  if (!DECIDE_ROLES.includes(profile.role)) {
    return { ok: false, error: "Only owner, manager, or supervisor can decide prefix exceptions." };
  }
  const id = str(formData.get("id"));
  if (!id) return { ok: false, error: "Select a pending request to decline." };
  const note = str(formData.get("note"));

  const { data, error } = await supabase
    .from("invoice_prefix_exceptions")
    .update({ status: "declined", decided_by: profile.id, decided_at: new Date().toISOString(), note: note || null })
    .eq("id", id)
    .eq("factory_id", profile.factory_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "This request is no longer pending. Refresh and try again." };

  revalidatePath(`${AUC}/prefix-approvals`);
  return { ok: true, notice: "Request declined." };
}
